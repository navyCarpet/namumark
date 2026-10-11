export type Value =
  | { t: "int"; v: bigint }
  | { t: "float"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "array"; v: Value[]; props?: Map<string, Value> }
  | { t: "object"; v: Map<string, Value> }
  | { t: "func"; name: string; props?: Map<string, Value> }
  | { t: "poison" };

const NULL: Value = { t: "null" };
const POISON: Value = { t: "poison" };
const int = (v: bigint): Value => ({ t: "int", v: BigInt.asIntN(64, v) });
const float = (v: number): Value => ({ t: "float", v });
const str = (v: string): Value => ({ t: "str", v });
const bool = (v: boolean): Value => ({ t: "bool", v });

const MAX_LEN = 100_000;
const MAX_DEPTH = 96;
const MAX_EVAL_DEPTH = 500;

const MAX_STR_LEN = 65_534;

export function toI64(v: bigint): bigint {
  return BigInt.asIntN(64, v);
}

export function truthy(v: Value): boolean {
  switch (v.t) {
    case "bool":
      return v.v;
    case "null":
      return false;
    case "int":
      return v.v !== 0n;
    case "float":
      return v.v !== 0 && !Number.isNaN(v.v);
    case "str":
      return v.v.length > 0;
    default:
      return true;
  }
}

const signView = new DataView(new ArrayBuffer(8));

const negativeNaNView = new DataView(new ArrayBuffer(8));
negativeNaNView.setBigUint64(0, 0xfff8_0000_0000_0000n);
const NEGATIVE_NAN = negativeNaNView.getFloat64(0);

export function stringify(v: Value): string {
  switch (v.t) {
    case "int":
      return v.v.toString();
    case "float": {
      const n = v.v;
      if (Number.isNaN(n)) {
        signView.setFloat64(0, n);
        return (signView.getUint8(0) & 0x80) !== 0 ? "-nan" : "nan";
      }
      if (!Number.isFinite(n)) return n < 0 ? "-inf" : "inf";
      if (Object.is(n, -0)) return "-0.000000";
      if (Math.abs(n) < 1e21) return n.toFixed(6);
      return BigInt(n).toString() + ".000000";
    }
    case "str":
      return v.v;
    case "bool":
      return v.v ? "true" : "false";
    default:
      return "[object Object]";
  }
}

function canonicalIndex(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && String(n) === s ? n : null;
}

function toIntBig(v: Value): bigint {
  switch (v.t) {
    case "int":
      return v.v;
    case "float":
      return Number.isFinite(v.v) ? BigInt(Math.trunc(v.v)) : -(2n ** 63n);
    case "bool":
      return v.v ? 1n : 0n;
    case "null":
      return 0n;
    case "str": {
      const m = /^\s*([+-]?\d+)/.exec(v.v);
      return m ? BigInt(m[1]) : 0n;
    }
    default:
      return 0n;
  }
}

function toNum(v: Value): number {
  switch (v.t) {
    case "int":
      return Number(v.v);
    case "float":
      return v.v;
    case "bool":
      return v.v ? 1 : 0;
    case "null":
      return 0;
    case "str":
      return strtod(v.v);
    default:
      return 0;
  }
}

function strtod(s: string): number {
  let i = 0;
  while (i < s.length && /\s/.test(s[i])) i++;
  let sign = 1;
  if (s[i] === "+" || s[i] === "-") {
    if (s[i] === "-") sign = -1;
    i++;
  }
  const rest = s.slice(i);

  if (/^inf(inity)?/i.test(rest)) return sign * Infinity;
  if (/^nan/i.test(rest)) return sign * NaN;

  const hex =
    /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?/.exec(rest);
  if (hex && (hex[1] || hex[2])) {
    let n = 0;
    for (const c of hex[1]) n = n * 16 + parseInt(c, 16);
    let place = 1 / 16;
    for (const c of hex[2] ?? "") {
      n += parseInt(c, 16) * place;
      place /= 16;
    }
    if (hex[3]) n *= Math.pow(2, Number(hex[3]));
    return sign * n;
  }

  const dec = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
  return dec ? sign * Number(dec[0]) : 0;
}

type Tok =
  | { t: "num"; v: Value }
  | { t: "str"; v: string }
  | { t: "name"; v: string }
  | { t: "punc"; v: string };

const OPS3 = ["**=", "<<=", ">>=", "&&=", "||=", "??="];
const OPS2 = [
  "**",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "++",
  "--",
  "<<",
  ">>",
  "?.",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
];

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdStart = (c: string) =>
  (c >= "a" && c <= "z") ||
  (c >= "A" && c <= "Z") ||
  c === "_" ||
  c === "$" ||
  c.charCodeAt(0) > 127;
const isIdPart = (c: string) => isIdStart(c) || isDigit(c);

function tokenize(source: string): Tok[] {
  if (source.length > MAX_LEN) throw new Error("expression too long");
  const tokens: Tok[] = [];
  let position = 0;
  const sourceLength = source.length;
  while (position < sourceLength) {
    const character = source[position];
    if (
      character === " " ||
      character === "\t" ||
      character === "\n" ||
      character === "\r"
    ) {
      position++;
      continue;
    }
    if (
      isDigit(character) ||
      (character === "." && isDigit(source[position + 1]))
    ) {
      if (
        character === "0" &&
        (source[position + 1] === "x" || source[position + 1] === "X")
      ) {
        let end = position + 2;
        while (end < sourceLength && /[0-9a-fA-F_]/.test(source[end])) end++;
        const digits = source.slice(position, end).replace(/_/g, "");
        tokens.push({ t: "num", v: int(BigInt(digits)) });
        position = end;
        continue;
      }
      if (
        character === "0" &&
        (source[position + 1] === "o" || source[position + 1] === "O")
      ) {
        let end = position + 2;
        while (end < sourceLength && /[0-7_]/.test(source[end])) end++;
        const digits = source.slice(position, end).replace(/_/g, "");
        tokens.push({ t: "num", v: int(BigInt(digits)) });
        position = end;
        continue;
      }
      if (
        character === "0" &&
        (source[position + 1] === "b" || source[position + 1] === "B")
      ) {
        let end = position + 2;
        while (end < sourceLength && /[01_]/.test(source[end])) end++;
        const digits = source.slice(position, end).replace(/_/g, "");
        tokens.push({ t: "num", v: int(BigInt(digits)) });
        position = end;
        continue;
      }
      if (character === "0" && isDigit(source[position + 1] ?? "")) {
        let end = position + 1;
        while (
          end < sourceLength &&
          (isDigit(source[end]) || source[end] === "_")
        )
          end++;
        const digits = source.slice(position, end).replace(/_/g, "");
        if (/^0[0-7]+$/.test(digits)) {
          if (source[end] === "." || source[end] === "e" || source[end] === "E")
            throw new Error("invalid octal literal");
          tokens.push({ t: "num", v: int(BigInt("0o" + digits.slice(1))) });
          position = end;
          continue;
        }
      }
      let end = position;
      while (
        end < sourceLength &&
        (isDigit(source[end]) || source[end] === "_")
      )
        end++;
      let isFloat = false;
      if (source[end] === ".") {
        isFloat = true;
        end++;
        while (
          end < sourceLength &&
          (isDigit(source[end]) || source[end] === "_")
        )
          end++;
      }
      const mantissa = source.slice(position, end).replace(/_/g, "");
      let exponent = "";
      if (source[end] === "e" || source[end] === "E") {
        isFloat = true;
        end++;
        end++;
        const from = end;
        while (end < sourceLength && isDigit(source[end])) end++;
        exponent = source.slice(from, end);
      }
      tokens.push({
        t: "num",
        v: isFloat
          ? float(parseFloat(mantissa + (exponent && "e" + exponent)))
          : int(BigInt(mantissa)),
      });
      position = end;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      let end = position + 1;
      let value = "";
      while (end < sourceLength && source[end] !== quote) {
        if (source[end] === "\\" && end + 1 < sourceLength) {
          const escapedCharacter = source[end + 1];
          if (escapedCharacter === "n") value += "\n";
          else if (escapedCharacter === "t") value += "\t";
          else if (escapedCharacter === "r") value += "\r";
          else value += escapedCharacter;
          end += 2;
        } else {
          value += source[end];
          end++;
        }
      }
      if (end >= sourceLength) throw new Error("unterminated string");
      tokens.push({ t: "str", v: value });
      position = end + 1;
      continue;
    }
    if (isIdStart(character)) {
      let end = position + 1;
      while (end < sourceLength && isIdPart(source[end])) end++;
      const word = source.slice(position, end);
      if (
        word === "typeof" &&
        (end >= sourceLength || !isIdPart(source[end]))
      ) {
        tokens.push({ t: "punc", v: "typeof" });
        position = end;
        continue;
      }
      tokens.push({ t: "name", v: word });
      position = end;
      continue;
    }
    const threeCharacterOperator = source.slice(position, position + 3);
    if (OPS3.includes(threeCharacterOperator)) {
      tokens.push({ t: "punc", v: threeCharacterOperator });
      position += 3;
      continue;
    }
    const twoCharacterOperator = source.slice(position, position + 2);
    if (OPS2.includes(twoCharacterOperator)) {
      tokens.push({ t: "punc", v: twoCharacterOperator });
      position += 2;
      continue;
    }
    if ("+-*/%&|^~!<>=()?:.[]{},;".includes(character)) {
      tokens.push({ t: "punc", v: character });
      position++;
      continue;
    }
    throw new Error("unexpected character: " + character);
  }
  return tokens;
}

type Node =
  | { k: "lit"; v: Value }
  | { k: "id"; name: string }
  | { k: "this" }
  | { k: "array"; els: Node[] }
  | { k: "object"; entries: [string, Node][] }
  | { k: "member"; obj: Node; name: string; optional: boolean }
  | { k: "index"; obj: Node; idx: Node; optional: boolean }
  | { k: "call"; callee: Node; args: Node[] }
  | { k: "unary"; op: string; operand: Node; prefix: boolean }
  | { k: "binary"; op: string; left: Node; right: Node }
  | { k: "logical"; op: string; left: Node; right: Node }
  | { k: "cond"; test: Node; cons: Node; alt: Node }
  | { k: "assign"; op: string; target: Node; value: Node }
  | { k: "seq"; items: Node[] };

const BINPREC: Record<string, number> = {
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  "<<": 8,
  ">>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
};
const ASSIGN_OPS = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  "&&=",
  "||=",
  "??=",
]);

class Parser {
  private tokens: Tok[];
  private position = 0;
  private nestingCost = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  parse(): Node {
    const node = this.sequence();
    if (this.position < this.tokens.length) throw new Error("trailing tokens");
    return node;
  }

  private isPunctuation(v: string): boolean {
    const token = this.tokens[this.position];
    return !!token && token.t === "punc" && token.v === v;
  }
  private consumePunctuation(v: string): void {
    if (!this.isPunctuation(v)) throw new Error("expected '" + v + "'");
    this.position++;
  }
  private enterNesting(cost: number): void {
    this.nestingCost += cost;
    if (this.nestingCost > MAX_DEPTH) throw new Error("expression too deep");
  }

  private sequence(): Node {
    let node = this.assignment();
    if (this.isPunctuation(",") || this.isPunctuation(";")) {
      const items = [node];
      while (this.isPunctuation(",") || this.isPunctuation(";")) {
        this.position++;
        if (this.position >= this.tokens.length || this.isPunctuation(")"))
          break;
        items.push(this.assignment());
      }
      node = { k: "seq", items };
    }
    return node;
  }

  private assignment(): Node {
    let node = this.ternary();
    while (true) {
      const token = this.tokens[this.position];
      if (token && token.t === "punc" && ASSIGN_OPS.has(token.v)) {
        this.position++;
        const value = this.ternary();
        node = { k: "assign", op: token.v, target: node, value };
      } else break;
    }
    return node;
  }

  private ternary(): Node {
    const test = this.binary(1);
    if (this.isPunctuation("?")) {
      this.position++;
      this.enterNesting(1);
      const consequent = this.assignment();
      this.consumePunctuation(":");
      const alternate = this.ternary();
      this.nestingCost--;
      return { k: "cond", test, cons: consequent, alt: alternate };
    }
    return test;
  }

  private binary(minimumPrecedence: number): Node {
    let left = this.exponentiation();
    while (true) {
      const token = this.tokens[this.position];
      if (!token || token.t !== "punc") break;
      if (token.v === "&&" || token.v === "||" || token.v === "??") {
        const precedence = token.v === "&&" ? 2 : 1;
        if (precedence < minimumPrecedence) break;
        this.position++;
        const right = this.binary(precedence + 1);
        left = { k: "logical", op: token.v, left, right };
        continue;
      }
      const precedence = BINPREC[token.v];
      if (precedence === undefined || precedence < minimumPrecedence) break;
      this.position++;
      const right = this.binary(precedence + 1);
      left = { k: "binary", op: token.v, left, right };
    }
    return left;
  }

  private exponentiation(): Node {
    const left = this.unary();
    if (this.isPunctuation("**")) {
      this.position++;
      this.enterNesting(1);
      const right = this.exponentiation();
      this.nestingCost--;
      return { k: "binary", op: "**", left, right };
    }
    return left;
  }

  private unary(): Node {
    const token = this.tokens[this.position];
    if (
      token &&
      token.t === "punc" &&
      (token.v === "!" ||
        token.v === "~" ||
        token.v === "+" ||
        token.v === "-" ||
        token.v === "++" ||
        token.v === "--" ||
        token.v === "typeof")
    ) {
      this.position++;
      this.enterNesting(1);
      const operand = this.unary();
      this.nestingCost--;
      return { k: "unary", op: token.v, operand, prefix: true };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.callMember();
    while (this.isPunctuation("++") || this.isPunctuation("--")) {
      const op = (this.tokens[this.position] as { v: string }).v;
      this.position++;
      node = { k: "unary", op, operand: node, prefix: false };
    }
    return node;
  }

  private callMember(): Node {
    const isNumberLiteral = this.tokens[this.position]?.t === "num";
    let node = this.primary();
    while (true) {
      if (this.isPunctuation(".")) {
        if (isNumberLiteral)
          throw new Error("member access on a number literal");
        this.position++;
        node = {
          k: "member",
          obj: node,
          name: this.identifier(),
          optional: false,
        };
      } else if (this.isPunctuation("?.")) {
        this.position++;
        if (this.isPunctuation("[")) {
          this.position++;
          this.enterNesting(4);
          const index = this.sequence();
          this.nestingCost -= 4;
          this.consumePunctuation("]");
          node = { k: "index", obj: node, idx: index, optional: true };
        } else if (this.isPunctuation("(")) {
          node = { k: "call", callee: node, args: this.args() };
        } else {
          node = {
            k: "member",
            obj: node,
            name: this.identifier(),
            optional: true,
          };
        }
      } else if (this.isPunctuation("[")) {
        this.position++;
        this.enterNesting(4);
        const index = this.sequence();
        this.nestingCost -= 4;
        this.consumePunctuation("]");
        node = { k: "index", obj: node, idx: index, optional: false };
      } else if (this.isPunctuation("(")) {
        node = { k: "call", callee: node, args: this.args() };
      } else break;
    }
    return node;
  }

  private args(): Node[] {
    this.consumePunctuation("(");
    const argumentsList: Node[] = [];
    this.enterNesting(5);
    if (!this.isPunctuation(")")) {
      argumentsList.push(this.assignment());
      while (this.isPunctuation(",")) {
        this.position++;
        argumentsList.push(this.assignment());
      }
    }
    this.nestingCost -= 5;
    this.consumePunctuation(")");
    return argumentsList;
  }

  private identifier(): string {
    const token = this.tokens[this.position];
    if (!token || token.t !== "name") throw new Error("expected identifier");
    this.position++;
    return token.v;
  }

  private primary(): Node {
    const token = this.tokens[this.position];
    if (!token) throw new Error("unexpected end of expression");
    if (token.t === "num") {
      this.position++;
      return { k: "lit", v: token.v };
    }
    if (token.t === "str") {
      this.position++;
      return { k: "lit", v: str(token.v) };
    }
    if (token.t === "name") {
      this.position++;
      switch (token.v) {
        case "true":
          return { k: "lit", v: bool(true) };
        case "false":
          return { k: "lit", v: bool(false) };
        case "null":
          return { k: "lit", v: NULL };
        case "NaN":
          return { k: "lit", v: float(NaN) };
        case "Infinity":
          return { k: "lit", v: float(Infinity) };
        case "this":
          return { k: "this" };
        default:
          return { k: "id", name: token.v };
      }
    }
    if (token.v === "(") {
      this.position++;
      this.enterNesting(5);
      const inner = this.sequence();
      this.nestingCost -= 5;
      this.consumePunctuation(")");
      return inner;
    }
    if (token.v === "[") {
      this.position++;
      this.enterNesting(5);
      const elements: Node[] = [];
      while (!this.isPunctuation("]")) {
        if (this.isPunctuation(",")) {
          this.position++;
          elements.push({ k: "lit", v: NULL });
          continue;
        }
        elements.push(this.assignment());
        if (this.isPunctuation(",")) this.position++;
      }
      this.nestingCost -= 5;
      this.consumePunctuation("]");
      return { k: "array", els: elements };
    }
    if (token.v === "{") {
      this.enterNesting(4);
      this.consumePunctuation("{");
      const entries: [string, Node][] = [];
      if (!this.isPunctuation("}")) {
        do {
          const keyToken = this.tokens[this.position];
          if (!keyToken) throw new Error("expected object key");
          let key: string;
          if (keyToken.t === "str" || keyToken.t === "name") key = keyToken.v;
          else if (keyToken.t === "num") key = stringify(keyToken.v);
          else throw new Error("invalid object key");
          this.position++;
          if (this.isPunctuation(":")) {
            this.position++;
            entries.push([key, this.assignment()]);
          } else {
            entries.push([key, { k: "lit", v: NULL }]);
          }
          if (!this.isPunctuation(",")) break;
          this.position++;
        } while (!this.isPunctuation("}"));
      }
      this.consumePunctuation("}");
      this.nestingCost -= 4;
      return { k: "object", entries };
    }
    throw new Error("unexpected token: " + token.v);
  }
}

export class Scope {
  vars = new Map<string, Value>();
  readonly now: bigint;

  constructor(params: Record<string, string> = {}) {
    this.now = BigInt(Math.floor(Date.now() / 1000));
    for (const name of GLOBAL_FUNCS) this.vars.set(name, { t: "func", name });
    for (const k in params)
      if (Object.prototype.hasOwnProperty.call(params, k))
        this.vars.set(k, str(params[k]));
  }

  has(name: string): boolean {
    return this.vars.has(name);
  }

  lookup(name: string): Value {
    return this.vars.get(name) ?? NULL;
  }
}

function eq(a: Value, b: Value): boolean {
  if (a.t === "null" || b.t === "null") return a.t === "null" && b.t === "null";
  if (a.t !== b.t) return false;
  if (a.t === "func") return a.name === (b as Value & { t: "func" }).name;
  return (a as { v: unknown }).v === (b as { v: unknown }).v;
}

function rel(a: Value, b: Value, op: string): boolean {
  let cmp: number;
  if (a.t === "int" && b.t === "int") cmp = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  else if (a.t === "float" && b.t === "float") {
    if (Number.isNaN(a.v) || Number.isNaN(b.v)) return false;
    cmp = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  } else if (a.t === "str" && b.t === "str")
    cmp = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  else return false;
  if (op === "<") return cmp < 0;
  if (op === ">") return cmp > 0;
  if (op === "<=") return cmp <= 0;
  return cmp >= 0;
}

function binaryOp(op: string, a: Value, b: Value): Value {
  switch (op) {
    case "+":
      if (a.t === "str" || b.t === "str") {
        const out = stringify(a) + stringify(b);
        if (out.length > MAX_STR_LEN)
          throw new Error("string length limit exceeded");
        return str(out);
      }
      if (a.t === "float" || b.t === "float") return float(toNum(a) + toNum(b));
      return int(toIntBig(a) + toIntBig(b));
    case "-": {
      if (a.t !== "float" && b.t !== "float")
        return int(toIntBig(a) - toIntBig(b));
      const x = toNum(a);
      const y = toNum(b);
      return float(
        !Number.isNaN(x) && x === y && !Number.isFinite(x)
          ? NEGATIVE_NAN
          : x - y,
      );
    }
    case "*": {
      if (a.t !== "float" && b.t !== "float")
        return int(toIntBig(a) * toIntBig(b));
      const x = toNum(a);
      const y = toNum(b);
      return float(
        (!Number.isNaN(x) && !Number.isFinite(x) && y === 0) ||
          (!Number.isNaN(y) && !Number.isFinite(y) && x === 0)
          ? NEGATIVE_NAN
          : x * y,
      );
    }
    case "/": {
      if (a.t === "float" || b.t === "float") {
        const d = toNum(b);
        if (d === 0) return float(toNum(a) === 0 ? Infinity : NaN);
        const n = toNum(a);
        if (!Number.isNaN(n) && !Number.isFinite(n) && !Number.isFinite(d))
          return float(NEGATIVE_NAN);
        return float(n / d);
      }
      const d = toIntBig(b);
      if (d === 0n) return float(toIntBig(a) === 0n ? Infinity : NaN);
      return int(toIntBig(a) / d);
    }
    case "%": {
      const d = toIntBig(b);
      if (d === 0n) return float(toIntBig(a) === 0n ? NaN : Infinity);
      return int(toIntBig(a) % d);
    }
    case "**":
      return float(Math.pow(toNum(a), toNum(b)));
    case "&":
      return int(toIntBig(a) & toIntBig(b));
    case "|":
      return int(toIntBig(a) | toIntBig(b));
    case "^":
      return int(toIntBig(a) ^ toIntBig(b));
    case "<<":
      return int(toIntBig(a) << (toIntBig(b) & 63n));
    case ">>":
      return int(toIntBig(a) >> (toIntBig(b) & 63n));
    case "==":
      return bool(eq(a, b));
    case "!=":
      return bool(!eq(a, b));
    case "<":
    case ">":
    case "<=":
    case ">=":
      return bool(rel(a, b, op));
    default:
      throw new Error("bad operator: " + op);
  }
}

const GLOBAL_FUNCS = ["parseInt", "isNaN", "toString", "time"] as const;
function isGlobalFunc(name: string): boolean {
  return GLOBAL_FUNCS.includes(name as (typeof GLOBAL_FUNCS)[number]);
}
const STRING_METHODS = [
  "indexOf",
  "lastIndexOf",
  "startsWith",
  "endsWith",
  "substring",
  "substr",
  "trim",
  "toString",
] as const;

function stringMethod(s: string, name: string, args: Value[]): Value {
  const argStr = () => stringify(args[0] ?? NULL);
  const argInt = (i: number) =>
    args[i] === undefined ? undefined : Number(toIntBig(args[i]));
  switch (name) {
    case "indexOf": {
      const needle = argStr();
      let from = argInt(1) ?? 0;
      if (from < 0) {
        from += s.length;
        if (from < 0) return int(-1n);
      }
      return int(BigInt(s.indexOf(needle, from)));
    }
    case "lastIndexOf": {
      const needle = argStr();
      if (needle === "") return int(-1n);
      const from = argInt(1);
      return int(
        BigInt(
          from === undefined || from < 0
            ? s.lastIndexOf(needle)
            : s.lastIndexOf(needle, from),
        ),
      );
    }
    case "startsWith":
      return bool(s.startsWith(argStr()));
    case "endsWith":
      return bool(s.endsWith(argStr()));
    case "substring": {
      const start = Math.trunc(toNum(args[0] ?? NULL));
      const given =
        args[1] === undefined ? s.length : Math.trunc(toNum(args[1]));
      const end = given < 0 ? s.length : given;
      if (start < 0 || start > end) return str("");
      return str(s.slice(start, Math.min(end, s.length)));
    }
    case "substr": {
      let start = Math.trunc(toNum(args[0] ?? NULL));
      if (start < 0) {
        start += s.length;
        if (start < 0) return str("");
      }
      if (args[1] === undefined) return str(s.slice(start));
      const len = Math.trunc(toNum(args[1]));
      return str(len <= 0 ? "" : s.substr(start, len));
    }
    case "trim":
      return str(s.trim());
    case "toString":
      return str(s);
    default:
      throw new Error("unknown string method: " + name);
  }
}

class Evaluator {
  private depth = 0;
  private scope: Scope;
  constructor(scope: Scope) {
    this.scope = scope;
  }

  run(node: Node, allowPoison = false): Value {
    if (++this.depth > MAX_EVAL_DEPTH) throw new Error("expression too deep");
    try {
      const value = this.evalNode(node);
      if (value.t === "poison" && !allowPoison)
        throw new Error("null property access consumed");
      return value;
    } finally {
      this.depth--;
    }
  }

  private evalNode(node: Node): Value {
    switch (node.k) {
      case "lit":
        return node.v;
      case "id":
        return this.scope.lookup(node.name);
      case "this":
        return { t: "object", v: this.scope.vars };
      case "array":
        return { t: "array", v: node.els.map((e) => this.run(e)) };
      case "object": {
        const m = new Map<string, Value>();
        for (const [k, vnode] of node.entries) m.set(k, this.run(vnode));
        return { t: "object", v: m };
      }
      case "member":
        return this.member(node);
      case "index":
        return this.index(node);
      case "call":
        return this.call(node);
      case "unary":
        return this.unary(node);
      case "binary": {
        const spine: (Node & { k: "binary" })[] = [];
        let leaf: Node = node;
        while (leaf.k === "binary") {
          spine.push(leaf);
          leaf = leaf.left;
        }
        let result = this.run(leaf);
        for (let i = spine.length - 1; i >= 0; i--)
          result = binaryOp(spine[i].op, result, this.run(spine[i].right));
        return result;
      }
      case "logical":
        return this.logical(node);
      case "cond":
        return truthy(this.run(node.test))
          ? this.run(node.cons)
          : this.run(node.alt);
      case "assign":
        return this.assign(node);
      case "seq": {
        const last = node.items.length - 1;
        for (let i = 0; i < last; i++) this.run(node.items[i], true);
        return last < 0 ? NULL : this.run(node.items[last], true);
      }
    }
  }

  private member(node: Node & { k: "member" }): Value {
    const objectValue = this.run(node.obj);
    if (objectValue.t === "null") return node.optional ? NULL : POISON;
    if (objectValue.t === "object") return objectValue.v.get(node.name) ?? NULL;
    if (objectValue.t === "array" || objectValue.t === "func") {
      const v = objectValue.props?.get(node.name);
      if (v !== undefined) return v;
    } else if (objectValue.t === "str") {
      if (node.name === "length") return int(BigInt(objectValue.v.length));
      if (STRING_METHODS.includes(node.name as (typeof STRING_METHODS)[number]))
        return { t: "func", name: node.name };
    }
    if (node.name === "toString") return { t: "func", name: "toString" };
    return NULL;
  }

  private index(node: Node & { k: "index" }): Value {
    const objectValue = this.run(node.obj);
    if (objectValue.t === "null") {
      try {
        this.run(node.idx, true);
      } catch {}
      return node.optional ? NULL : POISON;
    }
    const indexValue = this.run(node.idx);
    if (objectValue.t === "str") {
      if (indexValue.t === "str" && indexValue.v === "length")
        return int(BigInt(objectValue.v.length));
      if (indexValue.t !== "int") return NULL;
      const i = Number(indexValue.v);
      return i >= 0 && i < objectValue.v.length
        ? int(BigInt(objectValue.v.charCodeAt(i)))
        : NULL;
    }
    if (objectValue.t === "array") {
      const slot =
        indexValue.t === "int"
          ? Number(indexValue.v)
          : indexValue.t === "str"
            ? canonicalIndex(indexValue.v)
            : null;
      if (slot === null)
        return objectValue.props?.get(stringify(indexValue)) ?? NULL;
      return slot >= 0 && slot < objectValue.v.length
        ? objectValue.v[slot]
        : NULL;
    }
    if (objectValue.t === "object")
      return objectValue.v.get(stringify(indexValue)) ?? NULL;
    if (objectValue.t === "func")
      return objectValue.props?.get(stringify(indexValue)) ?? NULL;
    return NULL;
  }

  private call(node: Node & { k: "call" }): Value {
    const callee = node.callee;
    const args = node.args.map((a) => this.run(a));
    if (callee.k === "id" && isGlobalFunc(callee.name))
      return this.globalCall(callee.name, args);
    if (callee.k === "member") {
      const objectValue = this.run(callee.obj);
      if (objectValue.t === "null") throw new Error("method call on null");
      const held =
        objectValue.t === "object"
          ? objectValue.v.get(callee.name)
          : objectValue.t === "array" || objectValue.t === "func"
            ? objectValue.props?.get(callee.name)
            : undefined;
      if (held?.t === "func" && isGlobalFunc(held.name))
        return this.globalCall(held.name, args);
      if (callee.name === "toString") return str(stringify(objectValue));
      if (objectValue.t === "str")
        return stringMethod(objectValue.v, callee.name, args);
      throw new Error("no method '" + callee.name + "'");
    }
    const calleeValue = this.run(callee);
    if (calleeValue.t === "func" && isGlobalFunc(calleeValue.name))
      return this.globalCall(calleeValue.name, args);
    throw new Error("not callable");
  }

  private globalCall(name: string, args: Value[]): Value {
    switch (name) {
      case "parseInt": {
        const text = stringify(args[0] ?? NULL);
        let radix = args[1] === undefined ? 10 : Number(toIntBig(args[1]));
        if (radix !== 2 && radix !== 8 && radix !== 16) radix = 10;
        const parsedNumber = parseInt(text, radix);
        return Number.isNaN(parsedNumber)
          ? float(NaN)
          : int(BigInt(parsedNumber));
      }
      case "isNaN":
        return bool(args.length === 0 || Number.isNaN(toNum(args[0])));
      case "toString":
        return str(stringify({ t: "object", v: this.scope.vars }));
      default:
        return int(this.scope.now);
    }
  }

  private logical(node: Node & { k: "logical" }): Value {
    const spine: (Node & { k: "logical" })[] = [];
    let leaf: Node = node;
    while (leaf.k === "logical") {
      spine.push(leaf);
      leaf = leaf.left;
    }
    let result = this.run(leaf);
    for (let i = spine.length - 1; i >= 0; i--) {
      const op = spine[i].op;
      if (op === "&&" && !truthy(result)) continue;
      if (op === "??" && result.t !== "null") continue;
      if (op === "||" && truthy(result)) {
        this.run(spine[i].right);
        continue;
      }
      result = this.run(spine[i].right);
    }
    return result;
  }

  private unary(node: Node & { k: "unary" }): Value {
    if (node.op === "++" || node.op === "--") {
      const base = toIntBig(this.run(node.operand));
      const next = int(node.op === "++" ? base + 1n : base - 1n);
      this.assignTo(node.operand, next);
      return node.prefix ? next : int(base);
    }
    const operandValue = this.run(node.operand);
    switch (node.op) {
      case "!":
        return bool(!truthy(operandValue));
      case "~":
        return int(~toIntBig(operandValue));
      case "+":
        if (operandValue.t === "float" || operandValue.t === "int")
          return operandValue;
        return int(toIntBig(operandValue));
      case "-":
        return operandValue.t === "float"
          ? float(-operandValue.v)
          : int(-toIntBig(operandValue));
      case "typeof":
        if (operandValue.t === "int" || operandValue.t === "float")
          return str("number");
        if (operandValue.t === "str") return str("string");
        if (operandValue.t === "bool") return str("boolean");
        if (operandValue.t === "null") return str("null");
        if (operandValue.t === "func") return str("function");
        return str("object");
      default:
        throw new Error("bad unary: " + node.op);
    }
  }

  private assign(node: Node & { k: "assign" }): Value {
    const { op, target } = node;
    if (op === "=") {
      const value = this.run(node.value);
      this.assignTo(target, value);
      return value;
    }
    const currentValue = this.run(target);
    if (op === "||=") {
      if (truthy(currentValue)) {
        this.run(node.value);
        return currentValue;
      }
    } else if (op === "&&=") {
      if (!truthy(currentValue)) return currentValue;
    } else if (op === "??=") {
      if (currentValue.t !== "null") return currentValue;
    } else {
      const value = binaryOp(
        op.slice(0, -1),
        currentValue,
        this.run(node.value),
      );
      this.assignTo(target, value);
      return value;
    }
    const value = this.run(node.value);
    this.assignTo(target, value);
    return value;
  }

  private assignTo(target: Node, value: Value): void {
    if (target.k === "id") {
      this.scope.vars.set(target.name, value);
      return;
    }
    if (target.k === "member") {
      const objectValue = this.run(target.obj);
      if (objectValue.t === "object") objectValue.v.set(target.name, value);
      else if (objectValue.t === "array")
        (objectValue.props ??= new Map()).set(target.name, value);
      else if (objectValue.t === "func")
        (objectValue.props ??= new Map()).set(target.name, value);
      else throw new Error("cannot assign to member");
      return;
    }
    if (target.k === "index") {
      const objectValue = this.run(target.obj);
      const indexValue = this.run(target.idx);
      if (indexValue.t === "int") return;
      const key = stringify(indexValue);
      if (objectValue.t === "object") objectValue.v.set(key, value);
      else if (objectValue.t === "array") {
        const slot = indexValue.t === "str" ? canonicalIndex(key) : null;
        if (slot !== null) objectValue.v[slot] = value;
        else (objectValue.props ??= new Map()).set(key, value);
      } else if (objectValue.t === "func")
        (objectValue.props ??= new Map()).set(key, value);
      else throw new Error("cannot assign to index");
      return;
    }
    throw new Error("invalid assignment target");
  }
}

export function evaluate(src: string, scope: Scope): Value {
  if (src.trim() === "") return bool(true);
  const node = new Parser(src).parse();
  return new Evaluator(scope).run(node);
}
