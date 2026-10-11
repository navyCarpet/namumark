import { describe, expect, it } from "vitest";
import { Lexer, parse, prepare, serialize } from "../src/namumark.ts";
import type { Token, Tokens } from "../src/Tokens.ts";

const host = (t: Token) => {
  if (t.type === "macro" && (t as Tokens.Macro).name === "include")
    (t as Tokens.Macro).html = "<div>포함된 본문</div>";
  if (t.type === "link") {
    const l = t as Tokens.Link;
    if (l.kind) return;
    if (l.href.startsWith("분류:")) l.kind = "category";
    else if (l.href.startsWith("파일:")) {
      l.kind = "file";
      l.src = "https://cdn/x.png";
    }
  }
};

const doc = { async: false as const, title: "연습장", walkTokens: host };
const discuss = { ...doc, discuss: true };

describe("토론 모드 — 비활성화되는 문법", () => {
  it("#!html을 HTML로 실행하지 않고 일반 문자열로 출력한다", () => {

    expect(parse("{{{#!html <b>진하게</b>}}}", discuss)).toContain(
      "<code>#!html &lt;b&gt;진하게&lt;/b&gt;</code>",
    );

    expect(parse("{{{#!html <b>진하게</b>}}}", doc)).toContain(
      "<b>진하게</b>",
    );
  });

  it("#!syntax의 구문 강조는 유지한다", () => {

    const html = parse("{{{#!syntax javascript\nlet a=1;}}}", discuss);
    expect(html).toContain(
      '<pre><code class="hljs" data-language="javascript">',
    );
    expect(html).toContain('<span class="hljs-keyword">let</span>');
    expect(html).toBe(parse("{{{#!syntax javascript\nlet a=1;}}}", doc));
  });

  it("외부 처리기가 include 본문을 채워도 빈 결과를 출력한다", () => {
    expect(parse("[include(틀:상세내용)]", discuss)).not.toContain(
      "포함된 본문",
    );
    expect(parse("[include(틀:상세내용)]", doc)).toContain(
      "<div>포함된 본문</div>",
    );
  });

  it("include 앞뒤의 문단은 문서 모드와 같은 방식으로 나눈다", () => {

    expect(parse("[include(틀:x)]", discuss)).toBe("");
    expect(parse("앞[include(틀:x)]뒤", discuss)).toBe(
      '<div class="wiki-paragraph">앞뒤</div>',
    );

    const split = document.createElement("div");
    split.innerHTML = parse("앞줄\n[include(틀:x)]\n뒷줄", discuss);
    expect(
      [...split.children].map((c) => [c.className, c.textContent]),
    ).toEqual([
      ["wiki-paragraph", "앞줄"],
      ["wiki-paragraph", "뒷줄"],
    ]);

    const expanded = document.createElement("div");
    expanded.innerHTML = parse("앞줄\n[include(틀:x)]\n뒷줄", doc);
    expect(
      [...expanded.children].map((c) => [c.className, c.textContent]),
    ).toEqual([
      ["wiki-paragraph", "앞줄"],
      ["", "포함된 본문"],
      ["wiki-paragraph", "뒷줄"],
    ]);
  });

  it("include 매크로에 includeIndex를 부여하지 않아 외부에서 본문을 확장하지 않는다", () => {
    const shown = Lexer.lex("[include(틀:x)]", { discuss: false });
    prepare(shown, { discuss: false });
    expect((shown[0] as Tokens.Paragraph).tokens[0]).toHaveProperty(
      "includeIndex",
      1,
    );

    const hidden = Lexer.lex("[include(틀:x)]", { discuss: true });
    prepare(hidden, { discuss: true });
    expect((hidden[0] as Tokens.Paragraph).tokens[0]).not.toHaveProperty(
      "includeIndex",
    );
  });
});

describe("토론 모드 — 파일과 분류 링크", () => {
  it("파일을 이미지로 표시하지 않고 링크로 출력한다", () => {
    const html = parse("[[파일:예시.png]]", discuss);
    expect(html).toContain(
      '<a class="wiki-link-internal not-exist" href="/w/%ED%8C%8C%EC%9D%BC:%EC%98%88%EC%8B%9C.png" title="파일:예시.png" rel="nofollow">파일:예시.png</a>',
    );
    expect(html).not.toContain("<img");
  });

  it("파일 링크의 표시 문구와 이미지 옵션을 무시한다", () => {
    expect(parse("[[파일:예시.png|이 사진]]", discuss)).toContain(
      ">파일:예시.png</a>",
    );
    const opts = parse(
      "[[파일:예시.png|width=100&align=center]]",
      discuss,
    );
    expect(opts).toContain(">파일:예시.png</a>");
    expect(opts).not.toContain("width:100px");
  });

  it("앞에 콜론을 붙여 파일 처리를 끄면 표시 문구를 유지한다", () => {

    const html = parse("[[:파일:예시.png|이 사진]]", discuss);
    expect(html).toContain(">이 사진</a>");
    expect(html).toContain('title=":파일:예시.png"');
  });

  it("분류 링크를 제자리에 출력하고 바로 뒤의 줄바꿈은 제거한다", () => {
    expect(parse("[[분류:테스트]]\n다음 줄", discuss)).toBe(
      '<div class="wiki-paragraph">' +
        '<a class="wiki-link-internal not-exist" href="/w/%EB%B6%84%EB%A5%98:%ED%85%8C%EC%8A%A4%ED%8A%B8" title="분류:테스트" rel="nofollow">분류:테스트</a>' +
        "다음 줄</div>",
    );

    expect(parse("[[분류:테스트]]\n다음 줄", doc)).toBe(
      '<div class="wiki-paragraph">다음 줄</div>',
    );
  });
});

describe("토론 모드 — #N 댓글 링크", () => {
  const link = (n: string) =>
    `<a class="wiki-self-link" href="#${n}" title="">#${n}</a>`;

  it("줄 시작의 #N을 댓글 링크로 바꾼다", () => {
    expect(parse("#3 참고", discuss)).toBe(
      `<div class="wiki-paragraph">${link("3")} 참고</div>`,
    );
    expect(parse("앞줄\n#3", discuss)).toContain(`<br>${link("3")}`);
  });

  it("공백 바로 뒤의 #N을 댓글 링크로 바꾼다", () => {
    expect(parse("앞 #8을 참고", discuss)).toContain(
      `앞 ${link("8")}을 참고`,
    );
  });

  it("탭 바로 뒤의 #N을 댓글 링크로 바꾼다", () => {

    expect(parse("\t#3", discuss)).toBe(
      `<div class="wiki-paragraph">\t${link("3")}</div>`,
    );

    expect(parse("　#3", discuss)).toBe(
      '<div class="wiki-paragraph">　#3</div>',
    );
    expect(parse("가#3", discuss)).toBe(
      '<div class="wiki-paragraph">가#3</div>',
    );
  });

  it("바로 앞에 공백이 아닌 문자가 있으면 댓글 링크로 바꾸지 않는다", () => {

    expect(parse("앞#3", discuss)).toBe(
      '<div class="wiki-paragraph">앞#3</div>',
    );

    expect(parse("#2~#5 및 #8", discuss)).toBe(
      `<div class="wiki-paragraph">${link("2")}~#5 및 ${link("8")}</div>`,
    );
  });

  it("꾸밈 안과 단독 [ 뒤에서도 댓글 링크를 만든다", () => {
    expect(parse("'''#3'''", discuss)).toBe(
      `<div class="wiki-paragraph"><strong>${link("3")}</strong></div>`,
    );
    expect(parse("[ #3", discuss)).toBe(
      `<div class="wiki-paragraph">&#91; ${link("3")}</div>`,
    );
  });

  it("연속된 숫자까지만 댓글 번호로 인식한다", () => {
    expect(parse("#1a", discuss)).toBe(
      `<div class="wiki-paragraph">${link("1")}a</div>`,
    );

    expect(parse("#87CEEB", discuss)).toBe(
      `<div class="wiki-paragraph">${link("87")}CEEB</div>`,
    );
  });

  it("댓글 번호의 자릿수를 제한하지 않아 #0, #00, 11자리 번호도 허용한다", () => {
    expect(parse("#0 #00 #12345678901", discuss)).toBe(
      `<div class="wiki-paragraph">${link("0")} ${link("00")} ${link("12345678901")}</div>`,
    );
  });

  it("문서 모드에서는 #N을 일반 텍스트로 유지한다", () => {
    expect(parse("#3 참고", doc)).toBe(
      '<div class="wiki-paragraph">#3 참고</div>',
    );
  });

  it("## 주석, 앵커, 속성 문자열은 바꾸지 않는다", () => {

    expect(parse("## 숨은 3\n본문", discuss)).toBe(
      '<div class="wiki-paragraph">본문</div>',
    );

    expect(parse("[[#5]]", discuss)).toContain(
      '<a class="wiki-link-internal" href="#5" title="">#5</a>',
    );

    expect(
      parse(
        '{{{#!wiki style="background: #87CEEB"\n헥스코드}}}',
        discuss,
      ),
    ).toContain('<div style="background:#87CEEB">헥스코드</div>');
  });

  it("색상 중괄호, 제목, 표 셀 안에서도 댓글 링크를 만든다", () => {
    expect(parse("{{{#0275d8,#eca019 #11 참여자B}}}", discuss)).toContain(
      `${link("11")} 참여자B`,
    );
    expect(parse("= #7 답변 =", discuss)).toContain(`${link("7")} 답변`);
    expect(parse("||#9||", discuss)).toContain(link("9"));
  });
});

describe("토론 모드 — 계속 사용할 수 있는 문법", () => {
  const both = (src: string) => {
    const html = parse(src, discuss);
    expect(html).toBe(parse(src, doc));
    return html;
  };

  it("#!wiki를 그대로 처리한다", () => {
    expect(both('{{{#!wiki style="color:#036"\n문단}}}')).toContain(
      '<div style="color:#036">문단</div>',
    );
  });

  it("#!style과 해시로 만든 클래스 이름을 그대로 처리한다", () => {
    expect(
      both(
        '{{{#!style\n.note { color: green; }\n}}}\n{{{#!wiki class="note"\n문단}}}',
      ),
    ).toContain("<style>");
  });

  it("#!folding을 그대로 처리한다", () => {
    expect(both("{{{#!folding 더보기\n안쪽}}}")).toContain(
      '<details class="wiki-folding">',
    );
  });

  it("#!if를 그대로 처리한다", () => {
    expect(both("{{{#!if 1 == 1\n보임}}}")).toContain("보임");
  });

  it("#!latex를 그대로 처리한다", () => {
    both("{{{#!latex\n\\frac{1}{2}}}}");
  });

  it("각주를 그대로 처리한다", () => {
    expect(both("본문[* 각주 내용][각주]")).toContain("wiki-fn-content");
  });

  it("목차와 제목을 그대로 처리한다", () => {
    expect(both("[목차]\n= 제목 =\n본문")).toContain("wiki-macro-toc");
  });

  it("표를 그대로 처리한다", () => {
    expect(both("||<rowbgcolor=#00a495> A || B ||")).toContain(
      '<table class="wiki-table">',
    );
  });

  it("목록을 그대로 처리한다", () => {
    expect(both(" * 하나\n * 둘")).toContain('<ul class="wiki-list">');
  });

  it("인용문을 그대로 처리한다", () => {
    expect(both(">인용")).toContain('<blockquote class="wiki-quote">');
  });

  it("매크로를 그대로 처리한다", () => {
    expect(both("[br][anchor(끝)][ruby(猫, ruby=ねこ)]")).toContain(
      "<ruby>",
    );
  });

  it("수식을 그대로 처리한다", () => {
    expect(both("[math(a^2)] <math>b_1</math>")).toContain("katex");
  });
});

describe("토론 모드 — 직렬화", () => {
  const sample = `#3 참고 바랍니다. 앞#4는 링크가 아닙니다.
[[파일:예시 사진.png|이 사진]]과 [[:파일:예시 사진.png|이 사진]], [[분류:테스트]]
[include(틀:상세내용)]
{{{#!html <b>x</b>}}}
{{{#!syntax javascript
var a = 1;}}}
{{{#!wiki style="background: #87CEEB"
#87CEEB 헥스코드}}}
||<rowbgcolor=#00a495> #10 || [br] ||
 * #1a 항목
= #7 답변 =
`;

  it("원문 보존 모드에서 바이트 단위로 동일한 입력을 복원한다", () => {
    expect(serialize(Lexer.lex(sample, { discuss: true }))).toBe(sample);
    expect(serialize(Lexer.lex(sample, { discuss: false }))).toBe(sample);
  });
});
