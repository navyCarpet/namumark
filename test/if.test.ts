import { describe, expect, it } from "vitest";
import {
  evaluate,
  Scope,
  stringify,
  truthy,
} from "../src/prepare/Expression.ts";
import { Lexer, parse, serialize, tokens } from "../src/namumark.ts";

const ev = (e: string, p?: Record<string, string>) => evaluate(e, new Scope(p));
const s = (e: string, p?: Record<string, string>) => stringify(ev(e, p));
const tf = (e: string, p?: Record<string, string>) => truthy(ev(e, p));

describe("표현식 — 64비트 정수, 배정밀도 실수, %f 출력", () => {
  it("정수 나눗셈은 소수 부분을 버리고 0에 가까운 정수를 반환한다", () => {
    expect(s("7 / 2")).toBe("3");
    expect(s("100 / 7")).toBe("14");
    expect(s("5 / 10")).toBe("0");
    expect(tf("-21 / 6 == -3")).toBe(true);
    expect(tf("-21 / -3 == 7")).toBe(true);
    expect(tf("-21 / 6.0 == -3.5")).toBe(true);
  });

  it("정수는 부호 있는 64비트 BigInt로 계산하고 범위를 넘으면 순환한다", () => {
    expect(s("123456789 * 987654321")).toBe("121932631112635269");
    expect(s("9223372036854775807 + 1")).toBe("-9223372036854775808");
    expect(tf("9223372036854775807 + 1 < 0")).toBe(true);
    expect(s("1 << 40")).toBe("1099511627776");
    expect(tf("1 << 63 < 0")).toBe(true);
    expect(tf("1 << 64 > 0")).toBe(true);
    expect(tf("1 << 65 == 2")).toBe(true);
  });

  it("비트 연산은 실수의 소수 부분을 버리고 64비트로 계산한다", () => {
    expect(tf("~1234 == -1235")).toBe(true);
    expect(tf("12 << 2 == 48")).toBe(true);
    expect(tf("12 >> 2 == 3")).toBe(true);
    expect(s("-8 >> 1")).toBe("-4");
    expect(tf("(5 & 6) == 4")).toBe(true);
    expect(tf("(5 ^ 6) == 3")).toBe(true);
    expect(s("6.700 | 0")).toBe("6");
    expect(s("5.9 & 3")).toBe("1");
    expect(s("1 << 2.9")).toBe("4");
    expect(tf("(-6.7 | 0) == -6")).toBe(true);
  });

  it("**는 항상 실수를 반환하고 %는 정수로 계산하며 나누어지는 수의 부호를 따른다", () => {
    expect(tf("12 ** 3 == 1728.0")).toBe(true);
    expect(tf("2 ** 16 == 65536 + 0.0")).toBe(true);
    expect(tf("2 ** 3 == 8")).toBe(false);
    expect(tf("2 ** 3 == 8.0")).toBe(true);
    expect(tf("2 ** 3 ** 2 == 512.0")).toBe(true);
    expect(s("4 ** 0.5")).toBe("2.000000");
    expect(s("(-2) ** 3")).toBe("-8.000000");
    expect(tf("(-1) ** 0.5")).toBe(false);
    expect(tf("28 % 5 == 3")).toBe(true);
    expect(s("-7 % 3")).toBe("-1");
    expect(tf("7.5 % 2 == 1")).toBe(true);
  });

  it("실수는 printf의 %f처럼 소수점 아래 여섯 자리까지 출력하고 지수 표기를 쓰지 않는다", () => {
    expect(s("7.0 / 2")).toBe("3.500000");
    expect(s("6.0")).toBe("6.000000");
    expect(s("0.1 + 0.2")).toBe("0.300000");
    expect(s("2.0 / 3")).toBe("0.666667");
    expect(s("1.0 / 10000000")).toBe("0.000000");
    expect(s("10.0 ** 21")).toBe("1000000000000000000000.000000");
    expect(s("-3.5")).toBe("-3.500000");
  });

  it("지수 표기에서 지수를 무시하는 원본 동작을 재현한다", () => {
    expect(s("1e3")).toBe("1.000000");
    expect(s("2e1")).toBe("2.000000");
    expect(s("1.5e2")).toBe("1.500000");
    expect(s("1E3")).toBe("1.000000");
  });

  it("0으로 나누거나 나머지를 구하면 오류 없이 nan 또는 inf를 반환한다", () => {
    expect(s("1 / 0")).toBe("nan");
    expect(s("1.0 / 0")).toBe("nan");
    expect(s("0 / 0")).toBe("inf");
    expect(s("0.0 / 0.0")).toBe("inf");
    expect(s("5 % 0")).toBe("inf");
    expect(s("0 % 0")).toBe("nan");
  });

  it("nan과 inf는 C의 배정밀도 실수처럼 동작한다", () => {
    expect(s("typeof (1 / 0)")).toBe("number");
    expect(s("0.0 / 0.0 - 0.0 / 0.0")).toBe("-nan");
    expect(s("(0.0 / 0.0) * 0")).toBe("-nan");
    expect(s("(0.0 / 0.0) / (0.0 / 0.0)")).toBe("-nan");
    expect(s("-(0.0 / 0.0)")).toBe("-inf");
    expect(s("(0.0 / 0.0) | 0")).toBe("-9223372036854775808");
    expect(tf("n = 1.0 / 0.0, n != n")).toBe(true);
    expect(tf("n = 0.0 / 0.0, n == n")).toBe(true);
    expect(tf("!(1.0 / 0.0)")).toBe(true);
    expect(tf("!(0.0 / 0.0)")).toBe(false);

    expect(tf("(0.0 / 0.0) > 0")).toBe(false);
    expect(tf("n = 0.0 / 0.0, n <= n")).toBe(true);
    expect(tf("-(0.0 / 0.0) <= 0")).toBe(false);
  });

  it("음수 0을 유지한다", () => {
    expect(s("-(0.0)")).toBe("-0.000000");
    expect(s("0.0 * -1.0")).toBe("-0.000000");
    expect(s("-0.0 + 0.0")).toBe("0.000000");
    expect(tf("0.0 == -0.0")).toBe(true);
  });

  it("숫자 사이의 _는 구분자로만 쓰고 값에서는 무시한다", () => {
    expect(tf("1_000 == 1000")).toBe(true);
    expect(tf("1_0_0 == 100")).toBe(true);
    expect(tf("1_000.5 == 1000.5")).toBe(true);
    expect(tf("0x1_F == 31")).toBe(true);
    expect(tf("1_ == 1")).toBe(true);
    expect(tf("_5 == 5")).toBe(false);

    expect(tf("0o1_7 == 15")).toBe(true);
    expect(tf("0b1_01 == 5")).toBe(true);
  });
});

describe("표현식 — typeof", () => {
  it("실행 중의 자료형 이름을 나무위키 방식으로 반환한다", () => {
    expect(s("typeof 5")).toBe("number");
    expect(s("typeof 5.5")).toBe("number");
    expect(s("typeof 'x'")).toBe("string");
    expect(s("typeof true")).toBe("boolean");
    expect(s("typeof null")).toBe("null");
    expect(s("typeof undefx")).toBe("null");
    expect(s("typeof [1]")).toBe("object");
    expect(s("typeof {}")).toBe("object");
    expect(s("typeof (typeof 5)")).toBe("string");
    expect(s("typeof (+'3')")).toBe("number");
  });

  it("typeof는 다른 단항 연산자와 같은 우선순위로 계산하고 대입과 함께 쓸 수 있다", () => {

    const scope = new Scope();
    evaluate("t1 = typeof 5", scope);
    evaluate("t5 = typeof null", scope);
    expect(stringify(scope.lookup("t1"))).toBe("number");
    expect(stringify(scope.lookup("t5"))).toBe("null");

    expect(s("typeof !0")).toBe("boolean");
    expect(s("typeof -1")).toBe("number");
    expect(tf("typeof 5 == 'number'")).toBe(true);

    expect(tf("typeofx == null")).toBe(true);
    expect(s("typeof('x')")).toBe("string");
  });

  it("typeof 뒤에 단어 경계가 있으면 공백이 없어도 연산자로 인식한다", () => {

    expect(tf("(typeof+5) == 5")).toBe(false);
    expect(tf("(typeof+5) == 'number'")).toBe(true);
    expect(tf("(typeof-1) == 'number'")).toBe(true);
    expect(tf("(typeof!0) == 'boolean'")).toBe(true);
    expect(tf("(typeof'x') == 'string'")).toBe(true);

    expect(tf("typeofx == null")).toBe(true);
    expect(tf("typeof5 == null")).toBe(true);
  });
});

describe("표현식 — 참과 거짓 판정", () => {
  it("각 값을 참 또는 거짓으로 판정한다", () => {
    expect(tf("true")).toBe(true);
    expect(tf("Infinity")).toBe(true);
    expect(tf("1")).toBe(true);
    expect(tf("0.1")).toBe(true);
    expect(tf('"x"')).toBe(true);
    expect(tf("false")).toBe(false);
    expect(tf("null")).toBe(false);
    expect(tf("0")).toBe(false);
    expect(tf("0.0")).toBe(false);
    expect(tf("NaN")).toBe(false);
    expect(tf('""')).toBe(false);
    expect(tf("undefinedvar")).toBe(false);
  });
});

describe("표현식 — 자료형을 구분하는 비교와 형 변환", () => {
  it("동등 비교는 정수, 실수, 불리언, 문자열을 서로 다른 자료형으로 구분한다", () => {
    expect(tf("0 != 0.0")).toBe(true);
    expect(tf("0.0 == 0")).toBe(false);
    expect(tf("1 == 1.0")).toBe(false);
    expect(tf("true == 1")).toBe(false);
    expect(tf('"7" == 7')).toBe(false);
    expect(tf("null == 0")).toBe(false);
    expect(tf("null == null")).toBe(true);
    expect(tf('"" == ""')).toBe(true);
    expect(tf("NaN == NaN")).toBe(false);
    expect(tf("0.0 == -0.0")).toBe(true);
    expect(tf("[1] == [1]")).toBe(false);
  });

  it("대소 비교는 같은 자료형끼리 수행하고 문자열은 사전 순서로 비교한다", () => {
    expect(tf("1 < 2.0")).toBe(false);
    expect(tf("1 < 2 < 3")).toBe(false);
    expect(tf("2.0 >= 2")).toBe(false);
    expect(tf("2 ** 63 > 0")).toBe(false);
    expect(tf('"5" < 10')).toBe(false);
    expect(tf('"b" > "a"')).toBe(true);
    expect(tf('"10" < "9"')).toBe(true);
    expect(tf("1 < 2 == true")).toBe(true);
  });

  it("문서에 있는 =< 연산자는 엔진에서 지원하지 않아 파싱 오류가 난다", () => {
    expect(() => tf("3 =< 5")).toThrow();
    expect(() => tf("5 =< 3")).toThrow();
    expect(tf("3 <= 5")).toBe(true);
  });

  it("산술 연산은 문자열을 정수로 바꾸지만 +는 문자열을 연결한다", () => {
    expect(s('"3" + 4')).toBe("34");
    expect(s('"x" + 1 + 2')).toBe("x12");
    expect(s('1 + 2 + "x"')).toBe("3x");
    expect(s('"5" * 2')).toBe("10");
    expect(s('"3.5" * 1')).toBe("3");
    expect(s('"5abc" * 1')).toBe("5");
    expect(s('"a" - 1')).toBe("-1");
    expect(s('"" + 3.5 + 1')).toBe("3.5000001");
    expect(s('"n=" + 5.0')).toBe("n=5.000000");
    expect(s('"x" + null')).toBe("x[object Object]");
    expect(s("true + true")).toBe("2");
    expect(s("null + 1")).toBe("1");
  });

  it("단항 +와 -는 숫자의 자료형을 유지하고 문자열은 정수로 바꾼다", () => {
    expect(s("+3.5")).toBe("3.500000");
    expect(s('+"3.5"')).toBe("3");
    expect(s('+"  5  "')).toBe("5");
    expect(s("+true")).toBe("1");
    expect(s('-"5"')).toBe("-5");
    expect(s("- -5")).toBe("5");
    expect(tf("+null == 0")).toBe(true);
    expect(tf("!0")).toBe(true);
    expect(tf('!"x"')).toBe(false);
  });
});

describe("표현식 — 논리, 삼항, 대입, 순서 연산", () => {
  it("&&, ||, ??는 조건에 따라 피연산자 값을 반환한다", () => {
    expect(s("5 && 9")).toBe("9");
    expect(s("true && 5")).toBe("5");
    expect(s('0 || "x"')).toBe("x");
    expect(s('false || "z"')).toBe("z");
    expect(s('null ?? "d"')).toBe("d");
    expect(s("5 ?? 9")).toBe("5");
    expect(s("0 ?? 5")).toBe("0");
    expect(tf("(0 && 9) == 0")).toBe(true);
  });

  it("삼항 연산, 순서 연산, 증가와 감소를 처리한다", () => {
    expect(s('1 ? (2 ? "x" : "y") : "z"')).toBe("x");
    expect(tf("(true ? 1.0 : 2) == 1.0")).toBe(true);
    expect(s("(5, 6, 7)")).toBe("7");
    expect(s("a = 5, b = a++, b")).toBe("5");
    expect(s("a = 5, b = ++a, b")).toBe("6");
  });

  it("대입은 왼쪽부터 결합하고 대입 가능한 값이 필요하므로 연쇄 대입을 허용하지 않는다", () => {
    expect(s("(b = 5)")).toBe("5");
    expect(s("a = (b = 5)")).toBe("5");
    expect(() => ev("b = a = 5")).toThrow();
  });

  it("복합 대입 연산을 처리한다", () => {
    expect(s("a = 5, a *= 4")).toBe("20");
    expect(s("a = null, a ??= 7")).toBe("7");
    expect(s("a = 0, a ||= 9")).toBe("9");
    expect(s("a = 5.0, a += 1")).toBe("6.000000");
    expect(s("b ??= 5, b")).toBe("5");
  });

  it("연산자 우선순위를 따른다", () => {
    expect(s("2 + 3 * 4")).toBe("14");
    expect(s("2 + 3 * 4 ** 2")).toBe("50.000000");
    expect(tf("1 + 2 == 3 && 4 < 5")).toBe(true);
    expect(tf("(5 & 6) == 4")).toBe(true);
  });
});

describe("표현식 — 문자열, 배열, 객체, 속성", () => {
  it("문자열 길이는 UTF-16 코드 단위로 세고 인덱스로도 코드 단위를 반환한다", () => {
    expect(s('"🍈멜론".length')).toBe("4");
    expect(s('"hello".length')).toBe("5");
    expect(s('""+ "".length')).toBe("0");
    expect(tf('"AB"[0] == 65')).toBe(true);
    expect(tf('"AB"[0] == "A"')).toBe(false);
    expect(tf('"abc"[10] == null')).toBe(true);
  });

  it("허용된 문자열 메서드를 실행한다", () => {
    expect(s('"abc".indexOf("z")')).toBe("-1");
    expect(s('"abcabc".lastIndexOf("b")')).toBe("4");
    expect(tf('"abcabc".indexOf("a", 1) == 3')).toBe(true);
    expect(tf('"hi".startsWith("h")')).toBe(true);
    expect(tf('"hi".endsWith("i")')).toBe(true);
    expect(tf('"hello".startsWith("ell", 1)')).toBe(false);
    expect(s('"Hello".substring(1, 3)')).toBe("el");
    expect(s('"hello".substring(2, 100)')).toBe("llo");
    expect(tf('"Hello, World!".substring(12, 7) == ""')).toBe(true);
    expect(s('"hello".substr(-2)')).toBe("lo");
    expect(tf('"  hi ".trim() == "hi"')).toBe(true);
    expect(s("(5).toString()")).toBe("5");
    expect(s("(5.5).toString()")).toBe("5.500000");
    expect(s("true.toString()")).toBe("true");
  });

  it("지원하지 않는 메서드와 전역 parseInt를 구분한다", () => {
    expect(() => ev('"abc".charAt(1)')).toThrow();
    expect(() => ev('"abc".toUpperCase()')).toThrow();
    expect(() => ev('"abc".slice(1, 2)')).toThrow();
    expect(() => ev('parseFloat("3.5")')).toThrow();

    expect(tf("(123).length == null")).toBe(true);
    expect(tf('"abc".charAt == null')).toBe(true);
    expect(s('parseInt("0x1dff", 16)')).toBe("7679");
    expect(s('parseInt("FF", 16)')).toBe("255");
    expect(s('parseInt("12px")')).toBe("12");
    expect(s('parseInt("0x1f")')).toBe("0");

    expect(s('parseInt("11", 2)')).toBe("3");
    expect(s('parseInt("11", 8)')).toBe("9");
    expect(s('parseInt("11", 16)')).toBe("17");
    expect(s('parseInt("11", 3)')).toBe("11");
    expect(s('parseInt("11", 15)')).toBe("11");
    expect(s('parseInt("11", 36)')).toBe("11");
    expect(s('parseInt("abc")')).toBe("nan");
  });

  it("함수를 값으로 저장하고 전달할 수 있다", () => {
    expect(s("typeof parseInt")).toBe("function");
    expect(s('typeof "abc".indexOf')).toBe("function");
    expect(tf("parseInt == parseInt")).toBe(true);
    expect(tf("parseInt == toString")).toBe(false);
    expect(tf('"abc".indexOf == "abd".indexOf')).toBe(true);
    expect(tf("!parseInt")).toBe(false);
    expect(tf("parseInt.foo == null")).toBe(true);
    expect(tf('p = parseInt, p("12") == 12')).toBe(true);
    expect(tf('o = { }, o.f = parseInt, o.f("12") == 12')).toBe(true);
    expect(tf("p = parseInt, p.foo = 1, p.foo == 1")).toBe(true);
    expect(tf('typeof this.parseInt == "function"')).toBe(true);
    expect(s("isNaN()")).toBe("true");
    expect(s('isNaN("a")')).toBe("false");
    expect(s("toString(5)")).toBe("[object Object]");
  });

  it("실수 변환은 C의 strtod 규칙을 따른다", () => {
    expect(s('"3.5" ** 2')).toBe("12.250000");
    expect(s('"3abc" ** 1')).toBe("3.000000");
    expect(s('"  +3.5abc" ** 1')).toBe("3.500000");
    expect(s('"0X1A" ** 1')).toBe("26.000000");
    expect(s('"0x1p3" ** 1')).toBe("8.000000");
    expect(s('"inf" ** 1')).toBe("inf");
    expect(s('"-inf" ** 1')).toBe("-inf");
    expect(s('"nan" ** 1')).toBe("nan");
    expect(s('"1e400" ** 1')).toBe("inf");
    expect(s('"0b11" ** 1')).toBe("0.000000");

    expect(s('"3.5" - 0')).toBe("3");
    expect(s('"7" / "2"')).toBe("3");
  });

  it("배열과 객체를 처리한다", () => {
    expect(tf("['a','b','c'][1] == 'b'")).toBe(true);
    expect(tf("arr = [10,20], arr[5] == null")).toBe(true);
    expect(tf("arr = [10,20], arr[-1] == null")).toBe(true);
    expect(tf("arr = [[1,2],[3,4]], arr[1][0] == 3")).toBe(true);
    expect(tf("m = {'x':5,'y':7}, m['y'] == 7")).toBe(true);
    expect(tf("m = {'x':5}, m.x == 5")).toBe(true);
    expect(tf("m = {1:'x'}, m[1] == 'x'")).toBe(true);
    expect(tf("m = {'a':1}, m.b == null")).toBe(true);
    expect(s("m = {'a':1}, m.a = 2, m.a")).toBe("2");
    expect(s("[1,2,3].toString()")).toBe("[object Object]");
  });

  it("배열의 기본 속성 length와 indexOf는 null로 조회된다", () => {
    expect(tf("[1,2].length == null")).toBe(true);
    expect(tf("[].length == null")).toBe(true);
    expect(tf("a = [1,2], a['length'] == null")).toBe(true);
    expect(tf("a = [1,2], (a.length ?? 3) == 3")).toBe(true);
    expect(tf("a = [1,2], a.indexOf == null")).toBe(true);
    expect(tf("f = [10,20], f['0'] == 10")).toBe(true);
    expect(tf("a = [[1],[2]], a[0][0] == 1")).toBe(true);
    expect(() => ev("a = [1,2], a.indexOf(1)")).toThrow();
  });
});

describe("표현식 — null의 속성 접근", () => {
  it("null의 속성 접근 결과를 버리는 경우에만 오류 없이 진행한다", () => {
    expect(tf("1, null.foo, 1")).toBe(true);
    expect(() => ev("1, null.foo")).toThrow();
    expect(() => ev("x = null.foo, 1")).toThrow();
    expect(() => ev("x = null.foo, (x ?? 1) == 1")).toThrow();
  });

  it("null의 속성 접근 결과를 비교에 사용하면 오류가 난다", () => {
    expect(() => ev("null.foo == null")).toThrow();
    expect(() => ev("null.foo != null")).toThrow();
    expect(() => ev("null.foo == true")).toThrow();
    expect(() => ev("null.foo == false")).toThrow();
    expect(() => ev("null.foo == 1")).toThrow();
    expect(() => ev("null.foo == 0")).toThrow();
    expect(() => ev('null.foo == ""')).toThrow();
    expect(() => ev("null.foo == null.foo")).toThrow();
    expect(() => ev("null.foo > 0")).toThrow();
    expect(() => ev("1, null.foo == null, 1")).toThrow();
  });

  it("null의 속성 접근 결과를 typeof, !, 산술 연산, 문자열 연결에 사용하면 오류가 난다", () => {
    expect(() => ev('typeof null.foo == "null"')).toThrow();
    expect(() => ev('typeof null.foo == "object"')).toThrow();
    expect(() => ev('typeof null.foo == "undefined"')).toThrow();
    expect(() => ev('typeof null.foo == "boolean"')).toThrow();
    expect(() => ev('typeof null.foo == "number"')).toThrow();
    expect(() => ev('typeof null.foo == "string"')).toThrow();
    expect(() => ev("!null.foo")).toThrow();
    expect(() => ev("null.foo + 0 == 0")).toThrow();
    expect(() => ev('null.foo + "" == "null"')).toThrow();
    expect(() => ev('null.foo + "" == "[object Object]"')).toThrow();
    expect(() => ev('"" + null.foo != ""')).toThrow();
  });

  it("null의 속성 접근 결과는 ??, ||, &&, 삼항 연산에서도 오류가 난다", () => {
    expect(() => ev("null.foo ?? 1")).toThrow();
    expect(() => ev("(null.foo ?? 1) == 1")).toThrow();
    expect(() => ev("(null.foo || 1) == 1")).toThrow();
    expect(() => ev("(null.foo && 1) == null")).toThrow();
    expect(() => ev("(null.foo ? 1 : 2) == 2")).toThrow();
  });

  it("대괄호 접근, null이 담긴 변수, 정의되지 않은 이름의 속성 접근도 같은 규칙을 따른다", () => {
    expect(() => ev('null["foo"] == null')).toThrow();
    expect(() => ev("x = null, x.foo == null")).toThrow();
    expect(() => ev("nope.foo == null")).toThrow();
    expect(() => ev("(nope.foo ?? 1) == 1")).toThrow();
    expect(() => ev("null.foo.bar == null")).toThrow();
    expect(() => ev("null.foo.length == 0")).toThrow();
  });

  it("?.는 실제 null을 반환하지만 뒤쪽 계산을 생략하지 않는다", () => {
    expect(tf("null?.foo == null")).toBe(true);
    expect(tf('null?.["foo"] == null')).toBe(true);
    expect(tf("x = null, x?.foo == null")).toBe(true);
    expect(tf("(null?.foo ?? 1) == 1")).toBe(true);
    expect(tf("typeof null?.foo == 'null'")).toBe(true);
    expect(() => ev("null.trim()")).toThrow();
    expect(() => ev("null?.trim()")).toThrow();
    expect(tf("'ab'?.trim() == 'ab'")).toBe(true);
  });

  it("정의되지 않은 이름 자체는 속성 접근과 달리 일반 null이다", () => {
    expect(tf("nope == null")).toBe(true);
    expect(tf("(nope ?? 1) == 1")).toBe(true);
    expect(tf("(null ?? 1) == 1")).toBe(true);
    expect(tf('typeof nope == "null"')).toBe(true);
    expect(tf('typeof nope == "undefined"')).toBe(false);
  });

  it("인덱스 표현식은 계산하지만 그 안에서 발생한 오류는 무시한다", () => {
    expect(tf("x = 0, null[(x = 1)], x == 0")).toBe(false);
    expect(tf("x = 0, null[(x = 1)], x == 1")).toBe(true);
    expect(tf("1, null[(1/0)], 1")).toBe(true);
    expect(tf("x = 0, null?.[x = 1], x")).toBe(true);
  });
});

describe("표현식 — time()과 calleeTitle", () => {
  it("time()은 현재 유닉스 시간을 정수 초 단위로 반환한다", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(Number(s("time()"))).toBeGreaterThanOrEqual(now - 5);
    expect(Number(s("time()"))).toBeLessThanOrEqual(now + 5);
    expect(tf("time().toString().length == 10")).toBe(true);
    expect(tf("time() > 1e12")).toBe(false);
  });

  it("time()은 한 번의 렌더링 동안 같은 값을 반환하고 인수를 무시한다", () => {
    expect(tf("time() == time()")).toBe(true);
    expect(s("time(0)")).toBe(s("time()"));

    expect(tf("now = time(), now == time()")).toBe(true);
  });

  it("time이라는 변수에 대입해도 time() 함수를 가리지 않는다", () => {
    expect(tf("time = time(), time > 0")).toBe(true);
    expect(tf("time = 1, time() > 1")).toBe(true);
  });

  it("최상위의 calleeTitle은 다른 미정의 이름처럼 null이다", () => {
    expect(tf("calleeTitle == null")).toBe(true);
    expect(tf("calleeTitle != null")).toBe(false);
    expect(tf("calleeTitle + 1 == 1")).toBe(true);
    expect(tf('calleeTitle + "" == "[object Object]"')).toBe(true);
  });

  it("calleeTitle은 일반 매개변수이며 별도의 초기값이 매개변수를 덮어쓰지 않는다", () => {
    expect(tf("calleeTitle == null", { calleeTitle: "문서A" })).toBe(false);
    expect(tf('calleeTitle == "문서A"', { calleeTitle: "문서A" })).toBe(true);
  });

  it("calleeTitle에 대입하면 이후에는 대입한 값을 읽는다", () => {
    expect(tf("(calleeTitle = 5) == 5")).toBe(true);
    expect(tf("calleeTitle = 7, calleeTitle == 7")).toBe(true);
    expect(tf('calleeTitle = "x", calleeTitle == null')).toBe(false);
    expect(
      tf("calleeTitle = 7, calleeTitle == 7", { calleeTitle: "문서A" }),
    ).toBe(true);
  });
});

describe("표현식 — >>> 연산자와 0o, 0b 숫자 표기", () => {

  it(">>> 연산자는 지원하지 않아 표현식 파싱에 실패한다", () => {
    expect(() => ev("-16 >>> 2")).toThrow();
    expect(() =>
      ev("(n = -16, n = n >>> 2, n == 4611686018427387900)"),
    ).toThrow();
    expect(() => ev("(w = -16, w = w >>> 2, w == -4)")).toThrow();
    expect(() => ev("(k = -16, k >>>= 2, k == 4611686018427387900)")).toThrow();

    expect(s("-16 >> 2")).toBe("-4");
    expect(s("16 >> 2")).toBe("4");
  });

  it(">>> 연산자를 쓴 #!if는 본문을 숨긴다", () => {
    expect(
      parse(
        "{{{#!if (n = -16, n = n >>> 2, n == 4611686018427387900)\nSHIFT_EXPR_BIG}}}",
      ),
    ).not.toContain("SHIFT_EXPR_BIG");
    expect(
      parse(
        "{{{#!if (w = -16, w = w >>> 2, w == -4)\nSHIFT_EXPR_NEG4}}}",
      ),
    ).not.toContain("SHIFT_EXPR_NEG4");
    expect(
      parse("{{{#!if (g = -16, (g >>>= 2) || 1)\nSHIFT_PARSES}}}"),
    ).not.toContain("SHIFT_PARSES");
  });

  it("8진수와 2진수 정수 표기를 처리한다", () => {
    expect(tf("0o17 == 15")).toBe(true);
    expect(tf("0b101 == 5")).toBe(true);
    expect(s("0o777")).toBe("511");
    expect(s("0b11111111")).toBe("255");

    expect(tf("0O17 == 15")).toBe(true);
    expect(tf("0B101 == 5")).toBe(true);
    expect(tf("0x1f == 31")).toBe(true);
  });
});

describe("표현식 — 정의되지 않은 값의 ++와 -- 연산", () => {
  it("null은 0으로 취급하므로 미정의 변수의 ++cell은 참으로 판정되는 1이 된다", () => {
    expect(s("++cell")).toBe("1");
    expect(tf("++cell")).toBe(true);
    expect(s("--cell")).toBe("-1");
    expect(s("a = null, ++a")).toBe("1");
    expect(s("cell++, cell")).toBe("1");
    expect(s("cell++")).toBe("0");
  });

  it("증가와 감소 연산은 모든 값을 정수로 바꾼다", () => {
    expect(s('s = "3", (s++) + "," + s')).toBe("3,4");
    expect(s('s = "x", (s--) + "," + s')).toBe("0,-1");
    expect(s('f = 1.5, (f++) + "," + f')).toBe("1,2");
    expect(s('b = true, (b++) + "," + b')).toBe("1,2");
    expect(s('a = [1], (a++) + ""')).toBe("0");
  });
});

describe("표현식 — 신뢰할 수 없는 입력의 실행 제한", () => {
  it("프로토타입을 통한 우회와 전역 객체 접근을 허용하지 않는다", () => {

    expect(tf('"".constructor == null')).toBe(true);
    expect(tf("this.constructor == null")).toBe(true);
    expect(() =>
      ev('this.constructor.constructor("return process")()'),
    ).toThrow();
    expect(tf("__proto__ == null")).toBe(true);
    expect(tf("this['__proto__'] == null")).toBe(true);
    expect(tf("process == null")).toBe(true);
    expect(tf("globalThis == null")).toBe(true);
    expect(tf("constructor == null")).toBe(true);
    expect(tf("this == null")).toBe(false);
  });

  it("지원하지 않는 문법은 오류로 처리하고 렌더링을 중단하지 않는다", () => {
    expect(() => ev("1 === 1")).toThrow();
    expect(() => ev("2 +")).toThrow();
  });

  it("문자열 길이를 나무위키와 같은 65534자로 제한해 반복 배가로 인한 자원 고갈을 막는다", () => {

    const build = (n: number) => `(s="x",${"s=s+s,".repeat(n)}s.length)`;
    expect(s(build(15))).toBe("32768");
    expect(() => ev(build(16))).toThrow();

    expect(() => ev(build(40))).toThrow();
    expect(() => ev('"a" + "b"')).not.toThrow();
  });
});

describe("표현식 — 매개변수와 this", () => {
  const P = { fruit: "멜론", num: "7", empty: "", doc: "나무위키/역사" };
  it("매개변수는 문자열이며 이름 또는 this를 통해 읽을 수 있다", () => {
    expect(tf('fruit == "멜론"', P)).toBe(true);
    expect(tf('this.fruit == "멜론"', P)).toBe(true);
    expect(tf("this['fruit'] == \"멜론\"", P)).toBe(true);
    expect(tf('num == "7"', P)).toBe(true);
    expect(tf("num == 7", P)).toBe(false);
    expect(tf("(+num) == 7", P)).toBe(true);
    expect(tf("num > 5", P)).toBe(false);
    expect(tf("fruit.length == 2", P)).toBe(true);
  });
  it("정의되지 않은 매개변수는 null이고 빈 값은 빈 문자열이다", () => {
    expect(tf("unsetxyz == null", P)).toBe(true);
    expect(tf('empty == ""', P)).toBe(true);
    expect(tf("empty == null", P)).toBe(false);
    expect(tf('doc.startsWith("나무위키/")', P)).toBe(true);
  });
  it("매개변수로 산술 연산과 문자열 연결을 수행한다", () => {
    expect(s('fruit + "!"', P)).toBe("멜론!");
    expect(s("num * 2", P)).toBe("14");
  });
});

describe("#!if — 렌더링 전체 과정", () => {
  const r = (src: string, opt?: object) =>
    parse(src, opt) as string;

  it("조건의 참과 거짓 판정에 따라 본문을 보이거나 숨긴다", () => {
    expect(r("{{{#!if true\nX}}}")).toContain("X");
    expect(r("{{{#!if 7 + 3 == 10\nY}}}")).toContain("Y");
    expect(r("{{{#!if false\nX}}}")).not.toContain("X");
    expect(r("{{{#!if null\nX}}}")).not.toContain("X");
    expect(r("{{{#!if 0\nX}}}")).not.toContain("X");
    expect(r('{{{#!if ""\nX}}}')).not.toContain("X");
  });

  it("잘못된 표현식은 렌더링을 중단하지 않고 본문을 숨긴다", () => {
    expect(r("{{{#!if 2 +\nW}}}")).not.toContain("W");
  });

  it("블록 사이에서 변수 값을 유지한다", () => {
    const shown = r("{{{#!if c = true\nA}}}{{{#!if c\nB}}}");
    expect(shown).toContain("A");
    expect(shown).toContain("B");
    const reset = r("{{{#!if c = false\nA}}}{{{#!if c\nB}}}");
    expect(reset).not.toContain("A");
    expect(reset).not.toContain("B");
  });

  it("숨긴 본문은 계산하지 않으므로 변수 값도 바꾸지 않는다", () => {
    const html = r(
      "{{{#!if false\n{{{#!if hx = true\n}}}}}}{{{#!if hx\nZ}}}",
    );
    expect(html).not.toContain("Z");
  });

  it("time() 값을 대입한 다음 @param@으로 읽는 문서의 예제를 처리한다", () => {

    const html = r("{{{#!if now = time()\n@now@}}}");
    const shown = /(\d{10})/.exec(html)?.[1];
    expect(shown).toBeDefined();
    expect(
      Math.abs(Number(shown) - Math.floor(Date.now() / 1000)),
    ).toBeLessThan(5);
  });

  it("미정의 변수의 ++는 0부터 증가시키고 본문을 표시한다", () => {
    expect(r("{{{#!if ++cell\nX}}}")).toContain("X");
    expect(r("{{{#!if ++cell\n}}}{{{#!if cell == 1\nY}}}")).toContain(
      "Y",
    );
  });

  it("@param@은 대입한 값과 include 매개변수를 반영한다", () => {
    expect(r("{{{#!if d = 6.700 | 0\n@d@}}}")).toContain("6");
    expect(
      r('{{{#!if fruit == "멜론"\nM}}}', {
        parameters: { fruit: "멜론" },
      }),
    ).toContain("M");
    expect(
      r("{{{#!if 1\n@num@}}}", { parameters: { num: "7" } }),
    ).toContain("7");
  });

  it("일반 텍스트에서 미정의 @param@은 빈 문자열로 출력한다", () => {
    expect(r("E@nope2@F")).toBe('<div class="wiki-paragraph">EF</div>');
    expect(r("A@calleeTitle@B")).toBe(
      '<div class="wiki-paragraph">AB</div>',
    );

    expect(r("A@p=기본값@B")).toBe(
      '<div class="wiki-paragraph">A기본값B</div>',
    );
  });

  it("이름에 ASCII 공백이 있으면 매개변수로 인식하지 않는다", () => {
    expect(r("A@a b@B", { parameters: { "a b": "공백값" } })).toBe(
      '<div class="wiki-paragraph">A@a b@B</div>',
    );
    expect(r("bull @VVV @VVV")).toBe(
      '<div class="wiki-paragraph">bull @VVV @VVV</div>',
    );
  });

  it("이름에 탭이나 전각 공백이 있어도 매개변수 값을 찾는다", () => {
    expect(r("C@a\tb@D", { parameters: { "a\tb": "탭값" } })).toBe(
      '<div class="wiki-paragraph">C탭값D</div>',
    );
    expect(
      r("E@전각　이름@F", { parameters: { "전각　이름": "전각값" } }),
    ).toBe('<div class="wiki-paragraph">E전각값F</div>');
  });

  it("기본값에는 공백을 허용하지만 빈 기본값은 매개변수로 인식하지 않는다", () => {
    expect(r("G@p=기본 값@H")).toBe(
      '<div class="wiki-paragraph">G기본 값H</div>',
    );
    expect(r("I@nodef=@J")).toBe(
      '<div class="wiki-paragraph">I@nodef=@J</div>',
    );

    expect(r("I@nodef=@J", { parameters: { nodef: "값" } })).toBe(
      '<div class="wiki-paragraph">I@nodef=@J</div>',
    );
  });

  it("이름이 비어 있어도 매개변수로 인식하지 않는다", () => {
    expect(r("A@=x@B")).toBe('<div class="wiki-paragraph">A@=x@B</div>');

    expect(r("A@=@B")).toBe('<div class="wiki-paragraph">A@=@B</div>');
  });

  it("속성값에서도 공백이 든 이름, 빈 기본값, 빈 이름을 치환하지 않는다", () => {
    expect(
      parse('{{{#!wiki style="margin-top:@s p@px"\nK1}}}', {
        parameters: { "s p": "9" },
      }),
    ).toContain('<div style="margin-top:@s p@px">K1</div>');
    expect(
      parse('{{{#!wiki style="margin-top:@ed=@px"\nK2}}}'),
    ).toContain('<div style="margin-top:@ed=@px">K2</div>');
    expect(parse('{{{#!wiki style="margin-top:@=9@px"\nK3}}}')).toContain(
      '<div style="margin-top:@=9@px">K3</div>',
    );

    expect(
      parse('{{{#!wiki style="margin-top:@q@px"\nK4}}}', {
        parameters: { q: "7" },
      }),
    ).toContain('<div style="margin-top:7px">K4</div>');
    expect(
      parse('{{{#!wiki style="margin-top:@nope@px"\nK5}}}'),
    ).toContain('<div style="margin-top:px">K5</div>');
  });

  it("매크로 인수에서도 공백이 든 이름, 빈 기본값, 빈 이름을 치환하지 않는다", () => {
    const html = parse("[math(A @VVV @ B @ed=@ C @=x@ D)]");
    expect(html).toContain("@VVV @");
    expect(html).toContain("@ed=@");
    expect(html).toContain("@=x@");

    expect(
      parse("[math(a@s p@b)]", { parameters: { "s p": "7" } }),
    ).toContain("a@s p@b");

    expect(parse("[math(a@nope9@b)]")).toContain(">ab<");
  });

  it("빈 문자열 치환 규칙은 직렬화 결과를 바꾸지 않는다", () => {
    const src = "E@nope2@F @p=기본값@ @q@ @a b@ @nodef=@ @=x@ @p=기본 값@\n";
    expect(serialize(Lexer.lex(src))).toBe(src);
  });
});

describe("#!if — 본문을 별도 문단으로 감싸지 않는 규칙", () => {
  const r = (src: string, opt?: object) =>
    parse(src, opt) as string;

  it("최상위 본문은 바깥 문단 안에 인라인으로 남는다", () => {
    expect(r("앞 {{{#!if true\n본문}}} 뒤")).toBe(
      '<div class="wiki-paragraph">앞 본문 뒤</div>',
    );

    expect(
      r("{{{#!if true^false\nA, }}}{{{#!if !(true^true)\nB.}}}"),
    ).toBe('<div class="wiki-paragraph">A, B.</div>');
    expect(r("{{{#!if true\n첫 줄\n둘째 줄}}}")).toBe(
      '<div class="wiki-paragraph">첫 줄<br>둘째 줄</div>',
    );
  });

  it("표 셀 안의 본문은 셀의 문단에 합쳐진다", () => {
    const html = r("||텍스트: {{{#!if true\n42}}} ||");
    expect(html).toContain('<div class="wiki-paragraph">텍스트: 42</div>');
    expect(html).not.toContain(
      '<div class="wiki-paragraph"><div class="wiki-paragraph">',
    );
  });

  it("#!wiki 안의 본문은 표시 여부와 관계없이 새 문단을 만들지 않는다", () => {
    const shown = r('{{{#!wiki class="k"\n{{{#!if true\n본문}}}\n}}}');
    expect(shown).toContain(">본문</div>");
    expect(shown).not.toContain(
      '<div class="wiki-paragraph"><div class="wiki-paragraph">',
    );

    const nested = r(
      '{{{#!wiki class="k"\n{{{#!if true\n{{{#!if false\nX}}}}}}\n}}}',
    );
    expect(nested).not.toContain('<div class="wiki-paragraph"></div>');
    expect(nested).not.toContain("X");
  });

  it("본문의 블록 요소는 그대로 블록으로 출력한다", () => {
    expect(r("{{{#!if true\n||셀||}}}")).toContain(
      '<div class="wiki-table-wrap">',
    );
  });
});

describe("#!if — this와 공유하는 변수 저장소", () => {
  it("this['x']와 x는 양쪽 모두 같은 변수 값을 읽고 쓴다", () => {
    expect(s("this['x'] = 1, x")).toBe("1");
    expect(s("x = 1, this['x']")).toBe("1");
    expect(s("this.y = 2, y")).toBe("2");
    expect(s("y = 2, this.y")).toBe("2");

    expect(s("map5 = 0, this['map' + 5] = 1, map5")).toBe("1");
    expect(s("k = 'a', this[k] = 9, a")).toBe("9");
  });

  it("include 매개변수도 같은 변수 저장소의 초기값이 된다", () => {
    const P = { fruit: "멜론", empty: "" };
    expect(tf('fruit == "멜론"', P)).toBe(true);
    expect(tf('this.fruit == "멜론"', P)).toBe(true);
    expect(tf("this['fruit'] == \"멜론\"", P)).toBe(true);
    expect(tf('empty == ""', P)).toBe(true);
    expect(tf("unsetxyz == null", P)).toBe(true);
    expect(tf("this['unsetxyz'] == null", P)).toBe(true);
    expect(s('fruit = "사과", fruit', P)).toBe("사과");
    expect(s("this['fruit'] = '수박', fruit", P)).toBe("수박");
  });

  it("calleeTitle도 별도 공간 없이 같은 변수 저장소를 사용한다", () => {
    expect(tf("calleeTitle == null", { calleeTitle: "문서A" })).toBe(false);
    expect(
      tf("this['calleeTitle'] == \"문서A\"", { calleeTitle: "문서A" }),
    ).toBe(true);
    expect(tf("this['x'] = 1, this == null")).toBe(false);
  });

  it("@param@은 이름으로 대입하거나 this로 대입한 값을 모두 읽는다", () => {
    expect(parse("{{{#!if v = 5\n@v@}}}")).toContain("5");
    expect(parse("{{{#!if this['v'] = 5\n@v@}}}")).toContain("5");
    expect(
      parse("{{{#!if this['num'] = 9\n@num@}}}", {
        parameters: { num: "7" },
      }),
    ).toContain("9");
  });

  it("@calleeTitle@은 대입값, 매개변수 값 또는 빈 문자열을 출력한다", () => {
    expect(
      parse("{{{#!if calleeTitle = 7\n}}}X@calleeTitle@Y"),
    ).toContain("X7Y");
    expect(
      parse("A@calleeTitle@B", {
        parameters: { calleeTitle: "인자제목" },
      }),
    ).toContain("A인자제목B");
    expect(parse("A@calleeTitle@B")).toContain("AB");
  });
});

describe("#!if — 토큰 출력", () => {
  it("tokens()는 모든 단계의 raw를 제거하고 show를 결정한다", () => {
    const t = tokens("{{{#!if true\nhi}}}");
    let anyRaw = false;
    const walk = (arr: readonly unknown[]) => {
      for (const x of arr as Record<string, unknown>[]) {
        if ("raw" in x) anyRaw = true;
        if (Array.isArray(x.tokens)) walk(x.tokens);
      }
    };
    walk(t);
    expect(anyRaw).toBe(false);
    expect(JSON.stringify(t)).toContain('"show":true');
  });

  it("원문 보존 직렬화는 raw를 유지하므로 입력을 그대로 복원한다", async () => {
    const { serialize, Lexer } = await import("../src/namumark.ts");
    const src = "본문 {{{#!if a == 1\n조건부}}} 끝";
    expect(serialize(Lexer.lex(src))).toBe(src);
  });
});

describe("#!if — <rowif> 행 매개변수", () => {
  const r = (src: string, opt?: object) =>
    parse(src, opt) as string;

  it("표현식의 참과 거짓 판정에 따라 행 전체를 보이거나 숨긴다", () => {

    const src =
      '{{{#!if 이름="홍길동"; 국적="대한민국";\n}}}\n' +
      "||<rowif=이름> 이름 ||@이름@ ||\n" +
      "||<rowif=나이> 나이 ||@나이@ ||\n" +
      "||<rowif=국적> 국적 ||@국적@ ||";
    const html = r(src);
    expect(html).toContain("홍길동");
    expect(html).toContain("대한민국");
    expect(html).not.toContain("나이");
  });

  it("문서에서 앞서 설정한 변수 값만 읽는다", () => {
    const src = "||<rowif=show> seen ||\n{{{#!if show = true\n}}}";

    expect(r(src)).not.toContain("seen");
  });

  it("<rowif> 안의 =<는 파싱 오류이므로 행을 숨긴다", () => {
    const src =
      "{{{#!if age = 25\n}}}\n" +
      "||<rowif=age =< 30> young ||\n" +
      "||<rowif=age < 30> small ||";
    const html = r(src);
    expect(html).not.toContain("young");
    expect(html).toContain("small");
  });

  it("잘못된 rowif 표현식은 렌더링을 중단하지 않고 행을 숨긴다", () => {
    expect(r("||<rowif=2 +> oops ||")).not.toContain("oops");
  });

  it("원문 보존 직렬화는 prepare를 건너뛰므로 <rowif>를 유지한다", async () => {
    const { serialize, Lexer } = await import("../src/namumark.ts");
    const src = "||<rowif=이름> 이름 ||@이름@ ||";
    expect(serialize(Lexer.lex(src))).toBe(src);
  });
});
