import { beforeAll, describe, expect, it } from "vitest";
import { hashClassName } from "../src/renderer/css.ts";
import { Lexer, parse, prepare, serialize } from "../src/namumark.ts";
import type { Token, Tokens } from "../src/Tokens.ts";

const sample = String.raw`[[분류:테스트 문서]]
[목차]
##@ 편집창에서만 보이는 고정 주석입니다.
## 읽기 모드에서 사라지는 일반 주석입니다.

= 구름고양이 카페 =
'''구름고양이 카페'''는 이 테스트를 위해 지어낸 가상의 찻집이다.[* 실제로는 존재하지 않는다.] 대표 메뉴는 ''별빛차''와 __구름빵__ 이다.

== 메뉴 ==
=== 음료 ===
 * 별빛차
  * 차가운 것
  * 따뜻한 것
 * 구름라떼

 1. 첫째 잔
 1. 둘째 잔

기본 가격은 {{{+2 3000원}}}이며, 추천 색은 {{{#teal,#7fffd4 청록색}}}으로 표시한다.

> 한가한 날에는
>> 고양이가 카운터를 지킨다.

 들여쓴 안내 문구 한 줄.

----

== 차림표 ==
|메뉴판|<thead> 이름 ||<sortable> 가격 ||
||<|2> 별빛차 || 3000 ||
|| 4000 ||
||<bgcolor=gray><:> 구름빵 || 2500 ||

== 링크 ==
[[메뉴]] · [[메뉴|차림표 보기]] · [[#메뉴]] · [[https://example.com|바깥 링크]] · [[파일:고양이.png]] · \[[가짜 링크]]

== 틀 문법 ==
{{{#!wiki style="color:#036" dark-style="color:#9cf" lang="ko"
다크 모드까지 대응하는 문단이다.}}}

{{{#!folding 더 보기
접힌 내용 한 줄.}}}

{{{#!html <b>호스트가 새니타이즈한다.</b>}}}

{{{#!syntax python
print("구름")}}}

{{{#!style
.note { color: green; }
}}}
{{{#!wiki class="note"
클래스가 적용되는 문단.}}}

== 조건문과 매개변수 ==
{{{#!if 메뉴 == "별빛차"
지금 고른 메뉴는 @메뉴@이다.}}}

== 매크로 ==
[br][clearfix][anchor(끝)][pagecount] · [ruby(猫, ruby=ねこ)] · 수식 [math(a^2)] · 영상 [youtube(CLOUD1)] · [include(틀:꼬리말)]

[각주]
`;

function find(tokens: Token[], pred: (t: Token) => boolean): Token | undefined {
  for (const t of tokens) {
    if (pred(t)) return t;
    let kids: Token[] = [];
    if (t.type === "table") {
      const tb = t as Tokens.Table;
      kids = [
        ...(tb.caption?.tokens ?? []),
        ...tb.rows.flatMap((r) => r.flatMap((c) => c.tokens)),
      ];
    } else if (t.type === "list") {
      kids = (t as Tokens.List).items.flatMap((i) => i.tokens);
    } else if ((t as Tokens.Generic).tokens) {
      kids = (t as Tokens.Generic).tokens!;
    }
    const hit = find(kids, pred);
    if (hit) return hit;
  }
}

describe("문서의 토큰 분리", () => {
  it("예상한 최상위 블록 토큰을 생성한다", () => {
    const toks = Lexer.lex(sample);
    const top = new Set(toks.map((t) => t.type));
    expect(top.has("heading")).toBe(true);
    expect(top.has("table")).toBe(true);
    expect(top.has("list")).toBe(true);
    expect(top.has("blockquote")).toBe(true);
    expect(top.has("indent")).toBe(true);
    expect(top.has("hr")).toBe(true);
  });

  it("표 제목을 인라인 토큰으로 저장한다", () => {
    const table = find(Lexer.lex(sample), (t) => t.type === "table") as
      | Tokens.Table
      | undefined;
    expect(table?.caption).toBeTruthy();
    expect(table?.caption?.raw).toBe("|메뉴판|");
  });

  it("원문 보존 모드에서 바이트 단위까지 동일하게 복원한다", () => {
    expect(serialize(Lexer.lex(sample))).toBe(sample);
  });
});

describe("문서의 파싱과 준비 단계", () => {
  it("토큰 트리를 준비할 때 문서 메타데이터를 수집한다", () => {
    const raw = Lexer.lex(sample);
    expect(raw).not.toHaveProperty("headings");
    expect(raw).not.toHaveProperty("footnotes");
    expect(raw).not.toHaveProperty("footnoteGroups");
    expect(raw).not.toHaveProperty("footnoteFinalGroups");

    const toks = prepare(raw);
    expect(toks).toBe(raw);
    expect(toks.headings.length).toBe(8);
    expect(toks.footnotes.length).toBe(1);
  });

  it("문서 순서대로 제목 번호를 매기고 앵커를 만든다", () => {
    const toks = prepare(Lexer.lex(sample));
    expect(toks.headings[0].number).toBe("1.");
    expect(toks.headings[0].anchor).toBe("구름고양이 카페");
    expect(toks.headings[1].number).toBe("1.1.");
    expect(toks.headings.at(-1)!.section).toBe(8);
  });

  it("각주를 묶어 뒤의 [각주] 매크로에서 사용한다", () => {
    const toks = prepare(Lexer.lex(sample));
    expect(toks.footnoteGroups.length).toBe(1);
    expect(toks.footnoteGroups[0].label).toBe("1");

    expect(toks.footnoteFinalGroups.length).toBe(0);
  });

  it("#!if는 매개변수가 일치할 때만 본문을 표시한다", () => {
    const shown = Lexer.lex(sample);
    prepare(shown, { parameters: { 메뉴: "별빛차" } });
    expect((find(shown, (t) => t.type === "if") as Tokens.If).show).toBe(true);

    const hidden = Lexer.lex(sample);
    prepare(hidden);
    expect((find(hidden, (t) => t.type === "if") as Tokens.If).show).toBe(
      false,
    );
  });
});

describe("옵션을 지정한 문서 렌더링", () => {

  const options = {
    title: "구름고양이 카페",
    parameters: { 메뉴: "별빛차" },
    walkTokens: (token: Token) => {
      if (token.type === "macro") {
        const m = token as Tokens.Macro;
        if (m.name === "include") m.html = "<div>포함된 꼬리말</div>";
        if (m.name === "pagecount") m.count = 42;
      } else if (token.type === "link") {
        const l = token as Tokens.Link;

        if (l.kind) return;
        if (l.href.startsWith("분류:")) l.kind = "category";
        else if (l.href.startsWith("파일:")) {
          l.kind = "file";
          l.src = "/img/cat.png";

          l.exists = true;
        }
      }
    },
  };

  let html: string;
  beforeAll(() => {
    html = parse(sample, options) as string;
  });

  it("읽기 모드에서 ##과 ##@ 주석을 숨긴다", () => {
    expect(html).not.toContain("일반 주석");
    expect(html).not.toContain("편집창에서만");
  });

  it("제목과 문단별 편집 링크를 표시한다", () => {
    expect(html).toContain('class="wiki-edit-section"');
    expect(html).toContain("?section=1");
  });

  it("글자 꾸미기, 크기, 색상을 표시하고 색상 이름을 16진수와 어두운 색상으로 변환한다", () => {
    expect(html).toContain("<strong>구름고양이 카페</strong>");
    expect(html).toContain('<span class="wiki-size-up-2">3000원</span>');
    expect(html).toContain(
      '<span style="color:#008080" data-dark-style="color:#7fffd4;">청록색</span>',
    );
  });

  it("목록, 중첩 인용문, 들여쓰기, 구분선을 표시한다", () => {
    expect(html).toContain('<ul class="wiki-list">');
    expect(html).toContain('<ol class="wiki-list wiki-list"');
    expect(html).toContain("<blockquote");
    expect(html).toContain('<div class="wiki-indent">');
    expect(html).toContain("<hr>");
  });

  it("제목이 있는 표에 thead, sortable, rowspan, bgcolor를 적용한다", () => {
    expect(html).toContain("<caption>메뉴판</caption>");

    expect(html).toContain('class="wiki-table"');
    expect(html).not.toContain("wiki-table-sortable");
    expect(html).toContain("<thead>");
    expect(html).toContain('class="sortable-table-head-cell"');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain("background-color: rgb(128,128,128)");
  });

  it("내부 링크, 별도 표시 문구, 앵커, 외부 링크, 파일 링크를 표시한다", () => {
    expect(html).toContain(`href="/w/${encodeURI("메뉴")}"`);
    expect(html).toContain("차림표 보기</a>");
    expect(html).toContain(
      '<a class="wiki-link-external" href="https://example.com"',
    );
    expect(html).toContain('<span class="wiki-image-align-normal">');

    expect(html).toContain("&#91;&#91;가짜 링크&#93;&#93;");
  });

  it("#!wiki의 dark-style과 lang을 출력한다", () => {
    expect(html).toContain(
      '<div style="color:#036" data-dark-style="color:#9cf" lang="ko">다크 모드까지 대응하는 문단이다.</div>',
    );
  });

  it("#!folding, 정제한 #!html, 구문을 강조한 #!syntax를 표시한다", () => {
    expect(html).toContain(
      '<details class="wiki-folding"><summary> 더 보기</summary>',
    );
    expect(html).toContain("<b>호스트가 새니타이즈한다.</b>");
    expect(html).toContain(
      '<pre><code class="hljs" data-language="python"><span class="hljs-built_in">print</span>(<span class="hljs-string">&quot;구름&quot;</span>)</code></pre>',
    );
  });

  it("#!style의 범위와 해시를 적용하고 대응하는 #!wiki 클래스에도 해시를 적용한다", () => {
    const hash = hashClassName("note");
    expect(html).toContain(
      `<style>.wiki[class] .${hash}{color:green;}</style>`,
    );
    expect(html).toContain(
      `<div class="${hash}">클래스가 적용되는 문단.</div>`,
    );
  });

  it("@param@을 치환하고 조건이 일치하는 #!if 본문을 표시한다", () => {
    expect(html).toContain("지금 고른 메뉴는 별빛차이다.");
  });

  it("br, clearfix, anchor, pagecount, ruby, math, youtube, include, 각주 매크로를 표시한다", () => {
    expect(html).toContain("<br>");
    expect(html).toContain('<div class="wiki-clearfix"></div>');
    expect(html).toContain('<a id="끝"></a>42');
    expect(html).toContain("<ruby>猫<rp>(</rp><rt>ねこ</rt><rp>)</rp></ruby>");
    expect(html).toContain(
      '<annotation encoding="application/x-tex">a^2</annotation>',
    );
    expect(html).toContain('src="//www.youtube.com/embed/CLOUD1"');
    expect(html).toContain("<div>포함된 꼬리말</div>");
    expect(html).toContain("실제로는 존재하지 않는다.");
  });

  it("목차 매크로를 표시한다", () => {
    expect(html).toContain('class="wiki-macro-toc" id="toc"><details open>');
  });
});

describe("문서에서 확인한 속성 표기 방식", () => {
  it("모든 순서 있는 목록에서 따옴표 없는 <ol start=N>을 출력한다", () => {
    const html = parse(" 1. 번호\n a. 알파벳\n I. 로마\n") as string;
    expect(html).toContain('<ol class="wiki-list wiki-list" start=1>');
    expect(html).toContain('<ol class="wiki-list wiki-list-alpha" start=1>');
    expect(html).toContain(
      '<ol class="wiki-list wiki-list-upper-roman" start=1>',
    );
  });

  it("펼친 목차는 값 없는 <details open>으로 표시하고 접힌 목차는 open을 생략한다", () => {
    expect(parse("[목차]\n= A =\n")).toContain("<details open>");
    expect(parse("[목차(hide)]\n= A =\n")).toContain(
      "<details><summary></summary>",
    );
  });

  it("iframe의 allowfullscreen=\"\"을 빈 값으로 출력한다", () => {
    const html = parse(
      "[youtube(dQw4w9WgXcQ, width=100, height=50)]",
    ) as string;
    expect(html).toContain(
      '<iframe class="wiki-media" allowfullscreen="" width="100" height="50"',
    );
  });
});

describe("문서의 #!folding 제목", () => {
  it("#!folding 바로 뒤의 공백을 유지한다", () => {
    const html = parse("{{{#!folding 제목1\n본문\n}}}") as string;
    expect(html).toContain("<summary> 제목1</summary>");
  });

  it("끝의 공백까지 제목을 그대로 유지한다", () => {
    const html = parse(
      "{{{#!folding 제목앞뒤   \n본문E\n}}}",
    ) as string;
    expect(html).toContain("<summary> 제목앞뒤   </summary>");
  });

  it("제목이 없으면 More를 사용한다", () => {
    const html = parse("{{{#!folding\n본문F\n}}}") as string;
    expect(html).toContain("<summary>More</summary>");
  });

  it("다듬지 않은 제목을 바이트 단위까지 동일하게 복원한다", () => {
    const src = "{{{#!folding 제목앞뒤   \n본문E\n}}}";
    expect(serialize(Lexer.lex(src))).toBe(src);
    const bare = "{{{#!folding\n본문F\n}}}";
    expect(serialize(Lexer.lex(bare))).toBe(bare);
  });
});

describe("문서의 이름 있는 각주 묶음", () => {
  it("각 참조의 본문을 해당 참조의 툴팁으로 표시한다", () => {
    const html = parse(
      "[*그룹 이름있는각주] [*그룹 두번째]\n[각주]\n",
    ) as string;
    expect(html).toContain(
      'title="이름있는각주" href="#fn-%ea%b7%b8%eb%a3%b9"',
    );
    expect(html).toContain('title="두번째" href="#fn-%ea%b7%b8%eb%a3%b9"');
  });

  it("참조에 본문이 없으면 같은 묶음의 본문을 사용한다", () => {
    const html = parse(
      "[*h 하나] 사이글자 [*h] [*h 셋]\n[각주]\n",
    ) as string;
    const titles = [...html.matchAll(/title="([^"]*)" href="#fn-h"/g)].map(
      (m) => m[1],
    );
    expect(titles).toEqual(["하나", "하나", "셋"]);
  });

  it("묶음의 첫 참조에 매긴 전체 각주 번호부터 돌아가기 링크의 번호를 매긴다", () => {
    const html = parse(
      "[*g 첫본문] [*g 둘째본문] [*g 셋째본문]\n" +
        "[*h 하나] [*h] [*h 셋]\n" +
        "[*1 숫자이름] [*1 숫자둘째]\n" +
        "[* 익명1] [*g 그룹섞임] [* 익명2]\n" +
        "[각주]\n",
    ) as string;
    const sups = [...html.matchAll(/<sup>([\d.]+)<\/sup>/g)].map((m) => m[1]);
    expect(sups).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "4.1",
      "4.2",
      "4.3",
      "7.1",
      "7.2",
    ]);

    expect(html).toContain('<span id="fn-9"></span><a href="#rfn-9">');
    expect(html).toContain('<span id="fn-11"></span><a href="#rfn-11">');
  });

  it("참조가 하나인 묶음은 이름 없는 각주처럼 sup 없이 표시한다", () => {
    const html = parse("[*그룹B 본문B]\n[각주]\n") as string;
    expect(html).toContain(
      '<span id="fn-그룹B"></span><a href="#rfn-1">&#91;그룹B&#93;</a>',
    );
    expect(html).not.toContain("<sup>");
  });

  it("명시적인 각주 목록이 나올 때마다 이름 있는 각주 묶음을 새로 시작한다", () => {
    const html = parse(
      "앞[*x 처음]\n[각주]\n중[*x 두번째]\n[각주]\n뒤[*x]",
    ) as string;
    const lists = [
      ...html.matchAll(/<div class="wiki-macro-footnote">(.*?)<\/div>/g),
    ].map((match) => match[1]);
    expect(lists).toHaveLength(3);
    expect(lists[0]).toContain('<a href="#rfn-1">&#91;x&#93;</a> 처음');
    expect(lists[1]).toContain('<a href="#rfn-2">&#91;x&#93;</a> 두번째');
    expect(lists[2]).toContain('<a href="#rfn-3">&#91;x&#93;</a> ');
    expect(
      [...html.matchAll(/class="wiki-fn-content" title="([^"]*)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["처음", "두번째", ""]);
  });
});
