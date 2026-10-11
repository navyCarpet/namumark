import { describe, expect, it } from "vitest";
import { hashClassName } from "../src/renderer/css.ts";
import { parse } from "../src/namumark.ts";
import type { Token, Tokens } from "../src/Tokens.ts";

function render(src: string) {
  const html = parse(src) as string;
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("글자 꾸미기", () => {
  it("굵은 글씨", () => {
    const el = render(`'''asdf'''`);
    expect(el.querySelector("strong")?.textContent).toBe("asdf");
  });

  it("기울임꼴", () => {
    const el = render(`''fdsa''`);
    expect(el.querySelector("em")?.textContent).toBe("fdsa");
  });

  it("취소선 (~~)", () => {
    const el = render("hello ~~world~~ !");
    expect(el.querySelector("del")?.textContent).toBe("world");
  });

  it("취소선 (--)", () => {
    const el = render("a --b-- c");
    expect(el.querySelector("del")?.textContent).toBe("b");
  });

  it("밑줄", () => {
    const el = render("__under__");
    expect(el.querySelector("u")?.textContent).toBe("under");
  });

  it("위 첨자", () => {
    const el = render("a^^b^^");
    expect(el.querySelector("sup")?.textContent).toBe("b");
  });

  it("아래 첨자", () => {
    const el = render("a,,b,,");
    expect(el.querySelector("sub")?.textContent).toBe("b");
  });

  it("글자 꾸미기를 중첩한다", () => {
    const el = render(`'''bold ''italic'' bold'''`);
    const strong = el.querySelector("strong");
    expect(strong?.querySelector("em")?.textContent).toBe("italic");
  });

  it("더 긴 구분자를 우선한다 (''보다 ''')", () => {
    const el = render(`'''x'''`);
    expect(el.querySelector("strong")?.textContent).toBe("x");
    expect(el.querySelector("em")).toBeNull();
  });
});

describe("이스케이프", () => {
  it("이스케이프한 작은따옴표를 일반 문자로 표시한다", () => {
    const el = render(`\\''not italic''`);
    expect(el.querySelector("em")).toBeNull();
    expect(el.textContent).toContain(`'not italic`);
  });
});

describe("인라인 리터럴", () => {
  it("{{{ ... }}} 리터럴을 code 요소로 표시한다", () => {
    const el = render("{{{raw <text>}}}");
    expect(el.querySelector("code")?.textContent).toBe("raw <text>");
  });

  it("리터럴 안의 엔티티 참조를 다시 이스케이프한다", () => {

    expect(parse("{{{&ZeroWidthSpace;}}}")).toContain(
      "<code>&amp;ZeroWidthSpace;</code>",
    );
    expect(parse("{{{&#8203;}}}")).toContain("<code>&amp;#8203;</code>");
  });

  it("색상 중괄호를 밝은 색상과 어두운 색상이 있는 span으로 표시한다", () => {
    const el = render("{{{#red hello}}}");
    const span = el.querySelector('span[style*="color"]');
    expect(span?.textContent).toBe("hello");
  });

  it("크기 중괄호를 wiki-size 클래스가 있는 span으로 표시한다", () => {
    const el = render("{{{+2 big}}}");
    expect(el.querySelector("span.wiki-size-up-2")?.textContent).toBe("big");
  });

  it("색상과 크기 지정 뒤의 ASCII 공백을 서로 다른 범위까지 소비한다", () => {
    const space = render("{{{#fff COLOR}}} {{{+1 SIZE}}}");
    expect(space.querySelector('span[style*="color"]')?.textContent).toBe("COLOR");
    expect(space.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const tab = render("{{{#fff\tCOLOR}}} {{{+1\tSIZE}}}");
    expect(tab.querySelector('span[style*="color"]')?.textContent).toBe("COLOR");
    expect(tab.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const newline = render("{{{#fff\nCOLOR}}} {{{+1\nSIZE}}}");
    expect(newline.querySelector('span[style*="color"]')?.textContent).toBe("COLOR");
    expect(newline.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const verticalTab = render("{{{#fff\vCOLOR}}} {{{+1\vSIZE}}}");
    expect(verticalTab.querySelector('span[style*="color"]')?.textContent).toBe(
      "COLOR",
    );
    expect(verticalTab.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const formFeed = render("{{{#fff\fCOLOR}}} {{{+1\fSIZE}}}");
    expect(formFeed.querySelector('span[style*="color"]')?.textContent).toBe("COLOR");
    expect(formFeed.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const carriageReturn = render("{{{#fff\rCOLOR}}} {{{+1\rSIZE}}}");
    expect(carriageReturn.querySelector('span[style*="color"]')?.textContent).toBe(
      "COLOR",
    );
    expect(carriageReturn.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const el = render("{{{#fff \tCOLOR}}}|{{{+1 \tSIZE}}}");
    expect(el.querySelector('span[style*="color"]')?.textContent).toBe(
      "\tCOLOR",
    );
    expect(el.querySelector("span.wiki-size-up-1")?.textContent).toBe("SIZE");

    const nonBreakingSpace = render("{{{#fff\u00a0COLOR}}} {{{+1\u00a0SIZE}}}");
    expect(
      nonBreakingSpace.querySelector('span[style*="color"], .wiki-size-up-1'),
    ).toBeNull();

    const emSpace = render("{{{#fff\u2003COLOR}}} {{{+1\u2003SIZE}}}");
    expect(emSpace.querySelector('span[style*="color"], .wiki-size-up-1')).toBeNull();

    const ideographicSpace = render("{{{#fff\u3000COLOR}}} {{{+1\u3000SIZE}}}");
    expect(
      ideographicSpace.querySelector('span[style*="color"], .wiki-size-up-1'),
    ).toBeNull();
  });
});

describe("제목", () => {
  it("h1부터 h6까지 표시한다", () => {
    const heading1 = render("= title =");
    expect(heading1.querySelector("h1")?.textContent).toContain("title");

    const heading2 = render("== title ==");
    expect(heading2.querySelector("h2")?.textContent).toContain("title");

    const heading3 = render("=== title ===");
    expect(heading3.querySelector("h3")?.textContent).toContain("title");

    const heading4 = render("==== title ====");
    expect(heading4.querySelector("h4")?.textContent).toContain("title");

    const heading5 = render("===== title =====");
    expect(heading5.querySelector("h5")?.textContent).toContain("title");

    const heading6 = render("====== title ======");
    expect(heading6.querySelector("h6")?.textContent).toContain("title");
  });

  it("등호가 7개 이상이면 제목 대신 일반 텍스트로 표시한다", () => {
    const heading7 = render("======= title =======");
    expect(heading7.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(heading7.querySelector(".wiki-paragraph")?.textContent).toBe(
      "======= title =======",
    );

    const heading8 = render("======== title ========");
    expect(heading8.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(heading8.querySelector(".wiki-paragraph")?.textContent).toBe(
      "======== title ========",
    );

    const heading9 = render("========= title =========");
    expect(heading9.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(heading9.querySelector(".wiki-paragraph")?.textContent).toBe(
      "========= title =========",
    );

    const longerOpening = render("======= t ======");
    expect(longerOpening.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(longerOpening.querySelector(".wiki-paragraph")?.textContent).toBe(
      "======= t ======",
    );

    const longerClosing = render("====== t =======");
    expect(longerClosing.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(longerClosing.querySelector(".wiki-paragraph")?.textContent).toBe(
      "====== t =======",
    );
  });

  it("접힌 제목에 접힘 클래스를 추가한다", () => {
    const el = render("=# folded #=");
    expect(
      el.querySelector("h1")?.classList.contains("wiki-heading-folded"),
    ).toBe(true);
  });

  it("앵커 id에 이스케이프한 문자를 보존한다", () => {

    const el = render("== \\{{{#!wiki }}} 제목 ==");
    expect(el.querySelector("h2 > span")?.id).toBe("{{{#!wiki }}} 제목");
    const back = render("== \\\\begin 문법 ==");
    expect(back.querySelector("h2 > span")?.id).toBe("\\begin 문법");
  });

  it("유효한 색상·크기 중괄호 안에서 일반 텍스트 뒤의 제목을 인식한다", () => {
    const color = render("{{{#red\nPLAIN\n== H ==\nBODY\n}}}");
    expect(color.querySelector("h2")?.textContent).toContain("H");

    const size = render("{{{+1\nPLAIN\n== H ==\nBODY\n}}}");
    expect(size.querySelector("h2")?.textContent).toContain("H");

    const invalid = render("{{{#ffff\n== H ==\nBODY\n}}}");
    expect(invalid.querySelector("h2")).toBeNull();
    expect(invalid.querySelector("code")?.textContent).toContain("== H ==");
  });
});

describe("접힌 제목 (=# … #=)", () => {
  it("제목과 그 내용에 접힘 클래스를 추가한다", () => {
    const html = parse("=# 숨김 #=\n내용");
    expect(html).toContain('class="wiki-heading wiki-heading-folded"');
    expect(html).toContain(
      'class="wiki-heading-content wiki-heading-content-folded"',
    );
  });
});

describe("제목의 문단별 편집 링크 (title 옵션)", () => {
  it("title이 있으면 제목 span 안에 /edit/<doc>?section=N 링크를 표시한다", () => {
    const html = parse("== 개요 ==\n== 다음 ==", {
      title: "나무위키",
    });
    expect(html).toContain(
      `<span id="개요">개요<span class="wiki-edit-section"><a href="/edit/${encodeURI("나무위키")}?section=1" rel="nofollow">&#91;편집&#93;</a></span></span>`,
    );
    expect(html).toContain("?section=2");
  });
  it("title이 없으면 편집 링크를 생략한다", () => {
    expect(parse("== 개요 ==")).not.toContain("wiki-edit-section");
  });
});

describe("블록 문법", () => {
  it("붙임표가 4개부터 9개일 때만 구분선으로 표시한다", () => {
    expect(parse("----")).toBe("<hr>");
    expect(parse("-----")).toBe("<hr>");
    expect(parse("------")).toBe("<hr>");
    expect(parse("-------")).toBe("<hr>");
    expect(parse("--------")).toBe("<hr>");
    expect(parse("---------")).toBe("<hr>");

    expect(parse("---")).toBe('<div class="wiki-paragraph">---</div>');

    expect(parse("-".repeat(10))).toBe(
      '<div class="wiki-paragraph"><del></del>----</div>',
    );
  });

  it("인용문", () => {
    const el = render("> quoted");
    expect(el.querySelector("blockquote.wiki-quote")?.textContent).toContain(
      "quoted",
    );
  });

  it("순서 없는 목록", () => {
    const el = render(" * a\n * b");
    const items = el.querySelectorAll("ul.wiki-list > li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("a");
    expect(items[1].textContent).toContain("b");
  });

  it("십진수 번호가 있는 순서 있는 목록", () => {
    const el = render(" 1. one\n 1. two");
    const ol = el.querySelector("ol.wiki-list");

    expect(ol?.getAttribute("class")).toBe("wiki-list wiki-list");
    expect(ol?.querySelectorAll("li").length).toBe(2);
  });

  it("주석을 제거한다", () => {
    const html = parse("##invisible\nworld");
    expect(html).not.toContain("invisible");
    expect(html).toContain("world");
  });
});

describe("목록의 시작 번호 (나무위키에서는 항상 표시)", () => {
  it("기본 시작 번호로 start=1을 표시한다", () => {
    expect(parse(" 1. a")).toContain(
      '<ol class="wiki-list wiki-list" start=1>',
    );
  });
  it("a.#3의 시작 번호는 NaN이 아닌 3이다", () => {
    const html = parse(" a.#3 c");
    expect(html).toContain("start=3");
    expect(html).not.toContain("NaN");
  });
  it("순서 없는 목록에는 start 속성이 없다", () => {
    expect(parse(" * a")).toContain('<ul class="wiki-list">');
  });
});

describe("1.#N은 항상 새 목록을 시작한다", () => {
  it("번호가 이어져도 목록을 나눈다 (#5 → #6)", () => {
    const html = parse(" 1.#5 다섯\n 1.#6 여섯") as string;
    expect(html).toContain("start=5><li>");
    expect(html).toContain("</ol>");
    expect(html.match(/<ol /g)!.length).toBe(2);
    expect(html).toContain("start=6>");
  });
  it("번호가 반복되면 목록을 나눈다 (#5 → #5)", () => {
    const html = parse(" 1.#5 다섯\n 1.#5 또다섯") as string;
    expect(html.match(/<ol /g)!.length).toBe(2);
    expect(html.match(/start=5/g)!.length).toBe(2);
  });
  it("번호가 건너뛰면 목록을 나눈다 (#5 → #7)", () => {
    const html = parse(" 1.#5 다섯\n 1.#7 일곱") as string;
    expect(html.match(/<ol /g)!.length).toBe(2);
    expect(html).toContain("start=7>");
  });
  it("시작 번호 지정이 없는 항목은 앞선 목록에 이어진다", () => {
    const html = parse(" 1.#5 다섯\n 1. 일반") as string;
    expect(html.match(/<ol /g)!.length).toBe(1);
    expect(html.match(/<li>/g)!.length).toBe(2);
  });
});

describe("링크", () => {
  it("내부 링크", () => {
    const el = render("[[asdf]]");
    const a = el.querySelector("a")!;
    expect(a.classList.contains("wiki-link-internal")).toBe(true);
    expect(a.textContent).toBe("asdf");
  });

  it("외부 링크", () => {
    const el = render("[[https://example.com|example]]");
    const a = el.querySelector("a")!;
    expect(a.classList.contains("wiki-link-external")).toBe(true);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.textContent).toBe("example");
  });

  it("표시 문구가 있는 링크", () => {
    const el = render("[[target|display text]]");
    expect(el.querySelector("a")?.textContent).toBe("display text");
  });

  it("앵커가 있는 링크", () => {

    const el = render("[[page#section]]");
    const a = el.querySelector("a")!;
    const url = new URL(a.getAttribute("href")!, "https://wiki.example");
    expect(url.pathname).toBe("/w/page");
    expect(url.hash).toBe("#section");
    expect(a.getAttribute("title")).toBe("page");
    expect(a.textContent).toBe("page");
  });
});

describe("링크 대상의 이스케이프와 #, ] 처리", () => {
  it("대상에서 역슬래시 이스케이프를 해제한다", () => {

    expect(parse("[[\\\\]]")).toContain('href="/w/%5C" title="\\"');
    expect(parse("[[\\#]]")).toContain('href="/w/%23" title="#"');
    expect(parse("[[S\\#ARP]]")).toContain(
      'href="/w/S%23ARP" title="S#ARP"',
    );
  });

  it("끝의 #을 표시 문구에서 제거하고 경로의 #은 인코딩한다", () => {

    const a = parse("[[S#ARP#]]");
    expect(a).toContain('href="/w/S%23ARP" title="S#ARP"');
    expect(a).toContain(">S#ARP</a>");
    expect(a).not.toContain(">S#ARP#</a>");

    const b = parse("[[##]]");
    expect(b).toContain('href="/w/%23" title="#"');
    expect(b).toContain(">#</a>");
  });

  it("끝의 #이나 \\\\]를 사용하면 제목에 ]를 넣을 수 있다", () => {

    expect(parse("[[[12:00]#]]")).toContain(
      'href="/w/%5B12:00%5D" title="&#91;12:00&#93;"',
    );
    expect(parse("[[[12:00\\]]]")).toContain(
      'href="/w/%5B12:00%5D" title="&#91;12:00&#93;"',
    );
  });

  it("문서 경로와 앵커의 +, @, ,를 퍼센트 인코딩하고 / : ( ) !는 보존한다", () => {

    expect(parse("[[C++]]")).toContain('href="/w/C%2B%2B" title="C++"');
    expect(parse("[[@]]")).toContain('href="/w/%40" title="@"');
    expect(parse("[[#begin, end문법]]")).toContain(
      'href="#begin%2C%20end%EB%AC%B8%EB%B2%95"',
    );
    expect(parse("[[a&b=c?d;e$f]]")).toContain(
      'href="/w/a%26b%3Dc%3Fd%3Be%24f"',
    );

    expect(parse("[[틀:글무리/로그(수학)!-._]]")).toContain(
      'href="/w/%ED%8B%80:%EA%B8%80%EB%AC%B4%EB%A6%AC/%EB%A1%9C%EA%B7%B8(%EC%88%98%ED%95%99)!-._"',
    );

    expect(parse("[[파일:C++.png]]")).toContain(
      'href="/w/%ED%8C%8C%EC%9D%BC:C%2B%2B.png"',
    );
  });

  it("일반 링크, 앵커 링크, 외부 링크의 동작을 유지한다", () => {
    expect(parse("[[asdf]]")).toContain('href="/w/asdf" title="asdf"');

    expect(parse("[[나무위키#기능]]")).toContain(">나무위키</a>");
  });
});

describe("링크 대상 해석: 앵커, 콜론, 문서: 접두어, 상대 링크", () => {
  const doc = { title: "알파위키:연습장" };

  it("별도 표시 문구가 없으면 표시 문구에서 #앵커를 제거한다", () => {

    const a = parse("[[나무위키:문법 도움말/심화#아무개]]", doc);
    expect(a).toContain("#%EC%95%84%EB%AC%B4%EA%B0%9C");
    expect(a).toContain(">나무위키:문법 도움말/심화</a>");

    expect(
      parse(
        "[[나무위키:문법 도움말/심화#아무개|나무위키:문법 도움말/심화#아무개]]",
        doc,
      ),
    ).toContain(">나무위키:문법 도움말/심화#아무개</a>");

    expect(parse("[[#개요]]", doc)).toContain(">#개요</a>");
  });

  it("이름공간 목록은 호스트가 관리하므로 앞의 콜론을 보존한다", () => {

    const a = parse("[[:분류:분류]]", doc);
    expect(a).toContain('href="/w/:%EB%B6%84%EB%A5%98:%EB%B6%84%EB%A5%98"');
    expect(a).toContain('title=":분류:분류"');
    expect(a).toContain(">:분류:분류</a>");
  });

  it("콜론으로 시작하는 링크의 kind는 호스트가 정하도록 비워 둔다", () => {
    let kind: string | undefined = "unset";
    parse("[[:분류:분류]]", {
      ...doc,
      async: false,
      walkTokens: (t: Token) => {
        if (t.type === "link") kind = (t as Tokens.Link).kind;
      },
    });
    expect(kind).toBeUndefined();
  });

  it("[[../]]는 한 단계 위로 연결하고 문서명에 /가 없으면 자기 자신을 가리킨다", () => {
    const self = parse("[[../]]", doc);
    expect(self).toContain('class="wiki-self-link"');
    expect(self).toContain(
      'href="/w/%EC%95%8C%ED%8C%8C%EC%9C%84%ED%82%A4:%EC%97%B0%EC%8A%B5%EC%9E%A5" title="알파위키:연습장"',
    );
    expect(self).toContain(">../</a>");
    expect(self).not.toContain("not-exist");

    expect(parse("[[../]]", { title: "S/W 개발병" })).toContain(
      'href="/w/S" title="S"',
    );

    expect(parse("[[../../]]", { title: "S/W 개발병" })).toContain(
      'href="/w?doc=S/..%2F" title="S/../"',
    );
  });

  it("[[/하위]]는 현재 문서의 하위 문서에 연결하고 표시 문구는 그대로 둔다", () => {
    const a = parse("[[/심화]]", doc);
    expect(a).toContain(
      'href="/w/%EC%95%8C%ED%8C%8C%EC%9C%84%ED%82%A4:%EC%97%B0%EC%8A%B5%EC%9E%A5/%EC%8B%AC%ED%99%94"',
    );
    expect(a).toContain('title="알파위키:연습장/심화"');
    expect(a).toContain(">/심화</a>");
    expect(parse("[[/심화/TeX]]", doc)).toContain(
      'title="알파위키:연습장/심화/TeX"',
    );

    expect(parse("[[/심화#앵커|심화편 문서]]", doc)).toContain(
      'title="알파위키:연습장/심화"',
    );
  });

  it("문서:는 호스트가 제거할 이름공간 접두어이므로 보존한다", () => {

    const a = parse("[[문서:/// (너)]]", doc);
    expect(a).toContain(
      'href="/w/%EB%AC%B8%EC%84%9C:///%20(%EB%84%88)" title="문서:/// (너)"',
    );
    expect(a).toContain(">문서:/// (너)</a>");
  });

  it("호스트가 문서:를 제거한 링크와 원래 비어 있던 링크를 구분한다", () => {
    const html = parse("[[문서:]] [[|출력]]", {
      ...doc,
      async: false,
      walkTokens: (token: Token) => {
        if (token.type !== "link") return;
        const link = token as Tokens.Link;
        if (link.href !== "문서:") return;
        link.href = "";
        link.kind = "link";
        link.exists = false;
      },
    });
    expect(html).toContain(
      '<a class="wiki-link-internal not-exist" href="/w/" title="" rel="nofollow">문서:</a>',
    );
    expect(html).toContain(
      '<a class="wiki-self-link" href="" title="">출력</a>',
    );
  });

  it("앵커가 없어야 자기 링크가 되며 앵커만 있으면 wiki-link-internal을 유지한다", () => {
    expect(parse("[[알파위키:연습장]]", doc)).toContain(
      'class="wiki-self-link"',
    );

    const anchored = parse(
      "[[../#문법 무효화|문법 도움말 기본편 참조]]",
      doc,
    );
    expect(anchored).toContain('class="wiki-link-internal');
    expect(anchored).toContain('title="알파위키:연습장"');
    expect(parse("[[#s-1]]", doc)).toContain(
      '<a class="wiki-link-internal" href="#s-1" title="">#s-1</a>',
    );
    expect(parse("[[#s-1|1문단으로]]", doc)).toContain(
      '<a class="wiki-link-internal" href="#s-1" title="">1문단으로</a>',
    );

    expect(parse("[[|출력]]", doc)).toContain(
      '<a class="wiki-self-link" href="" title="">출력</a>',
    );
  });

  it("외부 링크의 href를 보존하고 title과 표시 문구에서 앵커를 제거한다", () => {

    expect(
      parse(
        "[[https://namu.wiki/edit/나무위키:문법 도움말|이 링크]]",
        doc,
      ),
    ).toContain('href="https://namu.wiki/edit/나무위키:문법 도움말"');
    const a = parse("[[https://emojipedia.org/check-mark#designs]]", doc);
    expect(a).toContain('href="https://emojipedia.org/check-mark#designs"');
    expect(a).toContain('title="https://emojipedia.org/check-mark"');
    expect(a).toContain(">https://emojipedia.org/check-mark</a>");

    expect(
      parse(
        "[[https://github.com/KaTeX/KaTeX/issues/1223#issuecomment-1793610796|#1223 내 코멘트]]",
        doc,
      ),
    ).toContain('title="https://github.com/KaTeX/KaTeX/issues/1223"');
  });

  it("중첩, 내용을 해석하지 않는 셀, 닫히지 않은 리터럴의 동작을 유지한다", () => {

    expect(parse("[[a|앞 [[b]] 뒤]]", doc)).toContain(
      '>앞 <a class="wiki-link-internal not-exist" href="/w/b" title="b" rel="nofollow">b</a> 뒤</a>',
    );
    expect(parse("||[[a|b||c]]||", doc)).toContain(">b||c</a>");
    expect(parse("[[a|[[b|[[c", doc)).toContain(
      "&#91;&#91;a|&#91;&#91;b|&#91;&#91;c",
    );
  });
});

describe("외부 링크의 rel 속성", () => {
  it("rel=\"nofollow noopener ugc\"를 추가한다", () => {
    expect(parse("[[https://namu.wiki|x]]")).toContain(
      '<a class="wiki-link-external" href="https://namu.wiki" target="_blank" rel="nofollow noopener ugc" title="https://namu.wiki">x</a>',
    );
  });
});

describe("파일 삽입: | 뒤의 이미지 매개변수를 다시 해석한다", () => {

  const opt = {
    async: false as const,
    walkTokens: (t: {
      type: string;
      href?: string;
      kind?: string;
      src?: string;
      exists?: boolean;
    }) => {
      if (t.type === "link" && t.href?.startsWith("파일:")) {
        t.kind = "file";
        t.src = "https://cdn/x.png";
        t.exists = true;
      }
    },
  };
  it("width를 지정해도 나무위키에서 확인한 구조를 유지한다", () => {
    const html = parse("[[파일:로고.png|width=100]]", opt);
    expect(html).toContain(
      '<span class="wiki-image-align-normal" style="width:100px;">',
    );
    expect(html).toContain(
      '<span class="wiki-image-wrapper" style="width: 100%;">',
    );
    expect(html).toContain('<img width="100%"');
  });
  it("align, object-fit, height 등의 매개변수를 해석하고 적용한다", () => {
    const html = parse(
      "[[파일:로고.png|width=120&height=120&align=center&object-fit=cover]]",
      opt,
    );
    expect(html).toContain('class="wiki-image-align-center"');
    expect(html).toContain("object-fit:cover");
    expect(html).toContain("height:120px");
  });
  it("height는 이미지 CSS가 아닌 바깥쪽 span의 크기를 지정한다", () => {
    const html = parse("[[파일:로고.png|height=50]]", opt);
    expect(html).toContain(
      '<span class="wiki-image-align-normal" style="height:50px;">',
    );
    expect(html).toContain(
      '<span class="wiki-image-wrapper" style="height: 100%;">',
    );
    expect(html).toContain('<img height="100%"');
  });
  it("theme은 정렬용 span에, bgcolor는 바깥쪽 span에 적용한다", () => {
    const themed = parse("[[파일:로고.png|theme=dark]]", opt);
    expect(themed).toContain(
      '<span class="wiki-image-align-normal wiki-theme-dark">',
    );
    const bg = parse("[[파일:로고.png|bgcolor=red]]", opt);
    expect(bg).toContain(
      '<span class="wiki-image-wrapper" style="background-color:red;">',
    );
  });

  it("키의 대소문자, 숫자로 시작하는 값, 중복 지정의 처리 규칙을 유지한다", () => {
    const plain = parse("[[파일:로고.png]]", opt);
    expect(parse("[[파일:로고.png|WIDTH=21]]", opt)).toBe(plain);
    expect(parse("[[파일:로고.png| width = 21 ]]", opt)).toBe(plain);
    expect(parse("[[파일:로고.png|width =21]]", opt)).toBe(plain);
    expect(parse("[[파일:로고.png|width= 21]]", opt)).toContain(
      'style="width:21px;"',
    );
    const prefixed = parse(
      "[[파일:로고.png|width=21;color:red&border-radius=10;opacity:0]]",
      opt,
    );
    expect(prefixed).toContain('style="width:21px;"');
    expect(prefixed).toContain("border-radius:10px");
    expect(prefixed).not.toContain("color:red");
    expect(prefixed).not.toContain("opacity:0");

    const duplicate = parse("[[파일:로고.png|width=10&width=20]]", opt);
    expect(duplicate).toContain('style="width:20px;"');
    expect(duplicate).not.toContain("width:10px");

    const encoded = parse("[[파일:로고.png|width=21%3Bcolor:red]]", opt);
    expect(encoded).toContain('style="width:21px;"');
    expect(encoded).not.toContain("color:red");
  });
});

describe("표 태그 사이의 줄바꿈 생략 (나무위키)", () => {
  it("<tr><td>와 </td></tr> 사이에 아무 문자도 넣지 않는다", () => {
    const html = parse("||<^|1>위||");
    expect(html).toContain('<tr class="wiki-table-tr"><td');
    expect(html).toContain("</td></tr>");
    expect(html).not.toMatch(/<tr[^>]*>\n/);
    expect(html).not.toMatch(/\n<\/td>/);
  });
});

describe("표의 빈 style과 data-dark-style 생략 (나무위키)", () => {
  it("일반 셀은 <td>만 표시하고 바깥 요소와 표에는 빈 속성을 넣지 않는다", () => {
    const html = parse("||그냥||");
    expect(html).toContain("<td><div");
    expect(html).toContain(
      '<div class="wiki-table-wrap"><table class="wiki-table">',
    );
    expect(html).not.toContain('data-dark-style=""');
    expect(html).not.toContain('style=""');
    expect(html).not.toContain('wiki-table-wrap" >');
  });

  it("정렬한 셀의 style은 유지하고 빈 data-dark-style은 생략한다", () => {
    const html = parse("||<:>가운데||");
    expect(html).toContain('<td style="text-align:center;"><div');
    expect(html).not.toContain("data-dark-style");
  });

  it("어두운 색상이 있으면 data-dark-style을 유지한다", () => {
    const html = parse("||<bgcolor=#f00,#00f>x||");
    expect(html).toContain('data-dark-style="background-color:#00f;"');
  });

  it("표의 스타일 선언은 ;로 끝내고 ; 뒤의 공백으로 구분한다", () => {
    expect(parse("||<width=70> W ||")).toContain(
      '<td style="width:70px; text-align:center;">',
    );
    const html = parse("|| ||<colbgcolor=#ff0000> A ||\n|| B || C ||");
    expect(html).toContain('<td style="text-align:right;">');
    expect(html).toContain(
      '<td style="background-color: rgb(255,0,0); text-align:center;"' +
        ' data-dark-style="background-color: rgb(204,0,0);">',
    );
  });

  it("표의 스타일 선언을 요소별로 정해진 순서에 따라 출력한다", () => {

    expect(
      parse(
        "||<bgcolor=#fc6><color=#000><width=70><height=30><:> composite ||",
      ),
    ).toContain(
      '<td style="color:#000; background-color:#fc6; width:70px;' +
        ' height:30px; text-align:center;"',
    );

    expect(parse("||<height=100><^|1> 위 ||")).toContain(
      'style="height:100px; text-align:center; vertical-align:top;"',
    );

    expect(
      parse("||<tablecolor=#000><tablebgcolor=#C0DFDE> x ||"),
    ).toContain('style="background-color: rgb(192,223,222); color:#000;"');

    expect(
      parse("||<tablebordercolor=Orange><tablebgcolor=SeaGreen> y ||"),
    ).toContain(
      'style="background-color: rgb(46,139,87); border:2px solid #ffa500;"' +
        ' data-dark-style="background-color: rgb(37,111,70);' +
        ' border:2px solid #CC8400;"',
    );
    expect(
      parse(
        "||<table width=500><tablebgcolor=transparent>" +
          "<tablebordercolor=#00a495,#2d2f34> z ||",
      ),
    ).toContain(
      'style="background-color:transparent; width:100%;' +
        ' border:2px solid #00a495;"',
    );
  });

  it("첫 선언의 값이 rgb()일 때만 콜론 뒤에 공백을 넣는다", () => {

    const k05 = parse(
      "||<bgcolor=#fc6><color=#000><width=70><height=30><:> composite ||",
    );
    expect(k05).toContain('data-dark-style="background-color: rgb(143,95,0);');
    expect(k05).not.toContain("; color: rgb(");

    expect(parse("||<tablebgcolor=transparent> t ||")).toContain(
      'style="background-color:transparent;"',
    );
    expect(parse("||<rowbgcolor=#fc6><rowcolor=#000> r ||")).toContain(
      '<tr class="wiki-table-tr" style="background-color:#fc6; color:#000;"',
    );

    expect(parse("||<color=#fff><bgcolor=#00a495> c ||")).toContain(
      'style="color:#fff; background-color:rgb(0,164,149); text-align:center;"',
    );
  });

  it("모든 <tr>에 wiki-table-tr 클래스를 추가한다", () => {
    expect(parse("||a||")).toContain('<tr class="wiki-table-tr">');

    expect(parse("||<thead>머||\n||본문||")).toContain(
      '<thead><tr class="wiki-table-tr">',
    );
  });

  it("<rowbgcolor>와 <rowcolor>는 각 <td>가 아닌 <tr>에 스타일을 적용한다", () => {

    const html = parse("||<rowbgcolor=#fc6><rowcolor=#000>a||b||");
    expect(html).toContain(
      '<tr class="wiki-table-tr" style="background-color:#fc6; color:#000;"' +
        ' data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);">',
    );
    expect(html).toContain("<td><div");

    const both = parse(
      "||<rowbgcolor=#f5f5f5><colbgcolor=#f5f5f5>a||b||",
    );
    expect(both).toContain(
      '<tr class="wiki-table-tr" style="background-color: rgb(245,245,245);"',
    );
    expect(both).toContain(
      '<td style="background-color: rgb(245,245,245);" data-dark-style="background-color: rgb(30,32,33);">',
    );
  });

  it("표 색상은 rgb()로 출력하고 3자리 16진수 색상과 transparent는 보존한다", () => {

    expect(parse("||<tablecolor=red>x||")).toContain(
      'style="color: rgb(255,0,0);" data-dark-style="color: rgb(255,123,123);"',
    );
    expect(parse("||<tablebgcolor=#ffffff>x||")).toContain(
      'style="background-color: rgb(255,255,255);" data-dark-style="background-color: rgb(24,26,27);"',
    );
    expect(parse("||<rowbgcolor=#ccc,#555>a||")).toContain(
      'style="background-color:#ccc;" data-dark-style="background-color:#555;"',
    );
    expect(parse("||<tablebgcolor=transparent>x||")).toContain(
      'style="background-color:transparent;" data-dark-style="background-color:transparent;"',
    );

    const alpha = parse("||<tablebgcolor=#ff00ff80> AH ||");
    expect(alpha).not.toContain("background-color");
    expect(alpha).toContain("&lt;tablebgcolor=#ff00ff80&gt; AH");
  });

  it("색상이 하나만 주어지면 어두운 색상을 생성한다", () => {

    expect(parse("||<tablecolor=black>x||")).toContain(
      'data-dark-style="color: rgb(195,190,182);"',
    );
    expect(parse("||<tablebgcolor=black>x||")).toContain(
      'data-dark-style="background-color: rgb(0,0,0);"',
    );

    expect(parse("||<rowcolor=#fff>a||")).toContain(
      'style="color:#fff;" data-dark-style="color:#fff;"',
    );
    expect(parse("||<tablecolor=#eaeaea>x||")).toContain(
      'style="color: rgb(234,234,234);" data-dark-style="color: rgb(234,234,234);"',
    );

    expect(parse("||<#f00>x||")).toContain(
      'style="background-color:#f00;" data-dark-style="background-color: rgb(204,0,0);"',
    );

    expect(parse("||<bgcolor=#fff,#zzz> IB ||")).toContain(
      'style="background-color:#fff; text-align:center;" data-dark-style="background-color: rgb(24,26,27);"',
    );
  });

  it("생성한 어두운 글자색은 그 아래의 어두운 배경색에 맞춘다", () => {

    expect(parse("||<bgcolor=#fc6><color=#000> p ||")).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);"',
    );
    expect(parse("||<bgcolor=#fc6><color=#666> p ||")).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);"',
    );

    expect(parse("||<bgcolor=#fc6><color=#f00> p ||")).toContain(
      'color:rgb(255,169,169);"',
    );
    expect(parse("||<bgcolor=#fc6><color=#00f> p ||")).toContain(
      'color:rgb(169,200,255);"',
    );

    expect(parse("||<bgcolor=#fff><color=#000> p ||")).toContain(
      'color:rgb(175,168,157);"',
    );
    expect(parse("||<bgcolor=#ccc><color=#111> p ||")).toContain(
      'color:rgb(202,197,190);"',
    );
    expect(parse("||<bgcolor=#f00><color=#000> p ||")).toContain(
      'color:rgb(244,243,241);"',
    );
  });

  it("배경과 명도 차이가 충분한 글자색은 그대로 둔다", () => {

    expect(parse("||<bgcolor=#fc6><color=#fff> p ||")).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:#fff;"',
    );

    expect(parse("||<bgcolor=#333><color=#ccc> dk ||")).toContain(
      'data-dark-style="background-color: rgb(38,42,43); color:#ccc;"',
    );

    expect(parse("||<bgcolor=#fc6,#888><color=#000> p1 ||")).toContain(
      'data-dark-style="background-color:#888; color:#000;"',
    );
    expect(parse("||<bgcolor=#fc6,#777><color=#000> p4 ||")).toContain(
      'data-dark-style="background-color:#777; color:#000;"',
    );

    expect(parse("||<bgcolor=#fc6><color=#a6a6a6> g1 ||")).toContain(
      'color:rgb(216,213,207);"',
    );
  });

  it("실제로 적용되는 배경색을 셀 → 열 → 행 → 표 순서로 선택한다", () => {

    expect(parse("||<rowbgcolor=#fc6> x ||<color=#000> y ||")).toContain(
      '<td style="color:#000; text-align:center;" data-dark-style="color: rgb(216,213,207);">',
    );

    expect(
      parse("||<tablebgcolor=#fc6> t ||<color=#000> u ||"),
    ).toContain(
      '<td style="color:#000; text-align:center;" data-dark-style="color: rgb(216,213,207);">',
    );

    expect(parse("||<colbgcolor=#fc6><color=#000> c1 ||")).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);"',
    );

    expect(parse("||<rowbgcolor=#fc6><colcolor=#000> c ||")).toContain(
      '<td style="color:#000; text-align:center;" data-dark-style="color: rgb(216,213,207);">',
    );

    expect(
      parse("||<rowbgcolor=#fc6><rowcolor=#000> r3 || r4 ||"),
    ).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);"',
    );

    expect(
      parse("||<width=25%><tablecolor=#000><tablebgcolor=#C0DFDE> t ||"),
    ).toContain(
      'data-dark-style="background-color: rgb(36,72,71); color:rgb(200,195,188);"',
    );
  });

  it("사용자가 지정한 어두운 배경색을 기준으로 삼고 배경이 없으면 기존 규칙을 유지한다", () => {

    expect(parse("||<bgcolor=#fc6,#555><color=#000> p2 ||")).toContain(
      'data-dark-style="background-color:#555; color:rgb(228,226,222);"',
    );

    expect(parse("||<bgcolor=#fc6,#555><color=#eee> p3 ||")).toContain(
      'data-dark-style="background-color:#555; color:#eee;"',
    );

    expect(parse("||<bgcolor=transparent><color=#000> tr ||")).toContain(
      'data-dark-style="background-color:transparent; color:rgb(195,190,182);"',
    );

    expect(parse("||<color=#000> f ||")).toContain(
      'data-dark-style="color: rgb(195,190,182);"',
    );

    expect(parse("||<bgcolor=#fc6> b ||")).toContain(
      'data-dark-style="background-color: rgb(143,95,0);"',
    );
    expect(parse("||<bgcolor=#fc6> b ||")).not.toContain("color:rgb");
  });

  it("셀 안의 색상 span은 해당 셀의 어두운 배경색에 맞춰 색상을 생성한다", () => {

    expect(parse("||<bgcolor=#fc6>{{{#red X}}}||")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#FFA9A9;">',
    );
    expect(
      parse("||<rowbgcolor=#00a495,#00a495> a ||{{{#red X}}}||"),
    ).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#FFBEBE;">',
    );
    expect(parse("||{{{#red X}}}||")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#FF7B7B;">',
    );

    expect(parse("{{{#red X}}}")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#ff0000;">',
    );

    const after = parse(
      "||<tablebgcolor=#fc6>{{{#000 X}}}||\n\n{{{#000 Y}}}",
    );
    expect(after).toContain('data-dark-style="color:#D8D5CF;"');
    expect(after).toContain('data-dark-style="color:#988F81;"');

    expect(parse("||<bgcolor=#fc6>{{{#f00,#0f0 X}}}||")).toContain(
      'data-dark-style="color:#0f0;"',
    );
  });

  it("뒤쪽 행에서 지정한 <tablebgcolor>가 앞쪽 행의 글자색에도 영향을 준다", () => {

    expect(
      parse("||<color=#000> r1 ||\n||<tablebgcolor=#fc6> r2 ||"),
    ).toContain('data-dark-style="color: rgb(216,213,207);"');

    expect(parse("||<color=#000> r1 ||\n|| r2 ||")).toContain(
      'data-dark-style="color: rgb(195,190,182);"',
    );

    expect(
      parse("||<tablecolor=#000> r1 ||\n||<tablebgcolor=#fc6> r2 ||"),
    ).toContain(
      'data-dark-style="background-color: rgb(143,95,0); color:rgb(216,213,207);"',
    );
  });

  it("옵션 값을 같은 종류의 따옴표로 감쌀 수 있다", () => {
    expect(parse('||<tablealign="center"> qa ||')).toContain(
      '<div class="wiki-table-wrap table-center">',
    );
    expect(parse("||<tablealign='center'> qd ||")).toContain(
      '<div class="wiki-table-wrap table-center">',
    );
    expect(parse('||<bgcolor="#fc6"> qb ||')).toContain(
      'style="background-color:#fc6; text-align:center;"',
    );
    expect(parse('||<width="70"> qc ||')).toContain(
      'style="width:70px; text-align:center;"',
    );

    const q18 = parse('||<-"2"> qe || qf ||');
    expect(q18).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">&lt;-&quot;2&quot;&gt; qe</div>',
    );
    expect(q18).not.toContain("colspan");

    expect(parse("||<bgcolor=\"#fc6'> x ||")).toContain(
      "&lt;bgcolor=&quot;#fc6&#39;&gt; x",
    );
  });

  it("<tablebordercolor>는 16진수 표기를 유지하고 어두운 테두리 색상도 생성한다", () => {

    expect(parse("||<tablebordercolor=gray>x||")).toContain(
      'style="border:2px solid #808080;" data-dark-style="border:2px solid #60686C;"',
    );
    expect(parse("||<tablebordercolor=transparent>x||")).toContain(
      'style="border:2px solid transparent;" data-dark-style="border:2px solid transparent;"',
    );

    expect(parse("||<tablebordercolor=gray,#zzz> TB ||")).toContain(
      'style="border:2px solid #808080;" data-dark-style="border:2px solid #60686C;"',
    );
  });

  it("<tablewidth>는 바깥 요소의 너비를 지정하고 <table>은 그 너비를 100% 채운다", () => {

    expect(parse("||<tablewidth=700>x||")).toContain(
      '<div class="wiki-table-wrap" style="width:700px"><table class="wiki-table" style="width:100%;">',
    );
    expect(parse("||<table width=100%>x||")).toContain(
      '<div class="wiki-table-wrap" style="width:100%"><table class="wiki-table" style="width:100%;">',
    );
  });

  it("단위 없는 정수 크기에 px를 붙이고 %, px, 소수는 그대로 둔다", () => {

    expect(parse("||<width=70>x||")).toContain('style="width:70px;');
    expect(parse("||<height=40>x||")).toContain('style="height:40px;');
    expect(parse("||<width=40%>x||")).toContain('style="width:40%;');
    expect(parse("||<width=300px>x||")).toContain('style="width:300px;');
    expect(parse("||<width=33.3>x||")).toContain('style="width:33.3;');
  });

  it("<^|n>과 <v|n>의 세로 정렬을 vertical-align으로 표시한다", () => {
    expect(parse("||<^|1>위||")).toContain(
      '<td rowspan="1" style="vertical-align:top;">',
    );
    expect(parse("||<v|1>아래||")).toContain(
      '<td rowspan="1" style="vertical-align:bottom;">',
    );

    expect(parse("||<:><^|2>x||y||\n||z||")).toContain(
      'style="text-align:center; vertical-align:top;"',
    );
  });

  it("<nopad>와 <keepall>은 인라인 스타일 대신 재사용 가능한 클래스로 표시한다", () => {
    const nopad = parse("||<nopad>x||");
    expect(nopad).toContain('<td class="wiki-table-nopadding">');
    expect(nopad).not.toContain("&lt;nopad&gt;");
    expect(nopad).not.toContain("padding:0px");
    expect(parse("||<keepall>x||")).toContain(
      '<td class="wiki-table-keepall">',
    );

    expect(parse("||<keepall><width=50%>x||")).toContain(
      '<td class="wiki-table-keepall" style="width:50%;">',
    );
    expect(parse("||<class=foo><nopad>x||")).toContain(
      `<td class="${hashClassName("foo")} wiki-table-nopadding">`,
    );
  });

  it("<thead>는 행을 <th> 셀이 있는 <thead>로 바꾸고 <sortable>은 클래스를 추가한다", () => {
    const src = "||<thead> 머 ||<sortable> 리 ||\n||행1||B||";
    const html = parse(src);
    const table = (render(src)).querySelector("table")!;
    expect([...table.children].map((c) => c.tagName)).toEqual([
      "THEAD",
      "TBODY",
    ]);
    expect(html).toContain('<th style="text-align:center;">');
    expect(html).toContain('<th class="sortable-table-head-cell"');
    expect(html).toContain("<td>");
    expect(html).not.toContain("&lt;thead&gt;");
  });

  it("<rowkeepall>은 <tr>에, <colkeepall>은 해당 열의 셀에 클래스를 추가한다", () => {

    expect(parse("||<rowkeepall>a||b||")).toContain(
      '<tr class="wiki-table-tr wiki-table-keepall">',
    );

    expect(parse("||<colkeepall>a||b||")).toContain(
      '<td class="wiki-table-keepall">',
    );
  });

  it("열 스타일은 선언한 셀이 시작하는 열에만 적용한다", () => {

    const bg = /style="[^"]*background-color: ?rgb\(245,245,245\)/g;

    const after = parse(
      "||<-4><colbgcolor=#f5f5f5> A ||\n|| b || c || d || e ||",
    ) as string;
    expect([...after.matchAll(bg)].length).toBe(2);
    const before = parse(
      "||<colbgcolor=#f5f5f5><-4> A ||\n|| b || c || d || e ||",
    ) as string;
    expect([...before.matchAll(bg)].length).toBe(2);

    const spanned = parse(
      "||<-2><colbgcolor=#f5f5f5> A ||<|2> B ||\n|| c || d ||",
    ) as string;
    expect([...spanned.matchAll(bg)].length).toBe(2);

    const again = parse(
      "||<colbgcolor=#f5f5f5> A ||\n||<colbgcolor=#008275> b ||",
    ) as string;
    expect(again).not.toContain("&lt;colbgcolor");
    expect(again).not.toContain("0,130,117");
    expect([...again.matchAll(bg)].length).toBe(2);
  });

  it("큰 colspan과 rowspan 값을 보존하고 메모리 사용은 셀 개수에 맞춘다", () => {

    const t = Date.now();
    const col = parse("||<-99999999> A ||");
    const row = parse("||<|99999999> A ||\n|| B ||");
    expect(Date.now() - t).toBeLessThan(1000);
    expect(col).toContain('colspan="99999999"');
    expect(row).toContain('rowspan="99999999"');
  });

  it("큰 colspan을 제한하지 않고 실제 열을 추적하며 병합 범위가 같을 때만 열 스타일을 전달한다", () => {

    const lastTd = (h: string) => [...h.matchAll(/<td[^>]*>/g)].pop()![0];
    const same = parse(
      "||<-99999999> A ||<colbgcolor=#ff0000> B ||\n||<-99999999> C || D ||",
    ) as string;
    const diff = parse(
      "||<-99999999> A ||<colbgcolor=#ff0000> B ||\n||<-88888888> C || D ||",
    ) as string;
    expect(lastTd(same)).toContain("background-color");
    expect(lastTd(diff)).not.toContain("background-color");
  });
});

describe("표 제목 (|cap| 시작 구문)", () => {
  it("앞의 |caption|을 <caption>으로 바꾸고 행의 셀을 유지한다", () => {
    const html = parse("|표 제목| 셀1 || 셀2 ||");
    expect(html).toContain("<caption>표 제목</caption>");
    expect(html).toContain("셀1");
    expect(html).toContain("셀2");

    expect(html).toMatch(/<table class="wiki-table"><caption>/);
  });

  it("표 제목에 굵은 글씨 같은 인라인 문법을 사용할 수 있다", () => {
    const html = parse("|'''굵은 제목'''| 내용 ||");
    expect(html).toContain("<caption><strong>굵은 제목</strong></caption>");
  });

  it("|| 셀이 없는 |x| 한 줄은 표가 아니다", () => {
    const html = parse("|그냥 텍스트|");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<caption>");
  });
});

describe("표 클래스: <tr>의 rowclass와 사용자 클래스 해시", () => {
  it("<rowclass>는 사용자 클래스를 <tr>에 적용한다", () => {
    const hash = hashClassName("myrow");
    expect(parse("||<rowclass=myrow> A || B ||")).toContain(
      `<tr class="wiki-table-tr ${hash}">`,
    );
  });
  it("<rowclass>와 <rowkeepall>을 같은 <tr>에 함께 적용한다", () => {
    expect(parse("||<rowclass=foo><rowkeepall>a||b||")).toContain(
      `<tr class="wiki-table-tr ${hashClassName("foo")} wiki-table-keepall">`,
    );
  });
  it("<class>, <tableclass>, <rowclass>는 #!wiki의 class와 같은 방식으로 해시한다", () => {

    const base = parse('{{{#!wiki class="myrow"\nx}}}') as string;
    const hash = base.match(/class="(_[0-9a-f]{16})"/)![1];
    expect(parse("||<rowclass=myrow> a ||")).toContain(
      `<tr class="wiki-table-tr ${hash}">`,
    );
    expect(parse("||<class=myrow>a||")).toContain(`<td class="${hash}">`);
    expect(parse("||<tableclass=myrow>a||")).toContain(
      `<table class="wiki-table ${hash}">`,
    );
  });
  it("의미가 정해진 nopadding과 keepall 클래스는 해시하지 않는다", () => {
    expect(parse("||<nopad>x||")).toContain(
      '<td class="wiki-table-nopadding">',
    );
  });
});

describe("표의 <sortable>은 <thead> 뒤에서만 인식한다", () => {
  it("<thead><sortable>은 머리글 셀에 클래스를 추가한다", () => {
    const html = parse("||<thead><sortable> A || B ||");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th class="sortable-table-head-cell"');
  });
  it("<sortable><thead>는 둘 다 셀의 텍스트로 남긴다", () => {
    const html = parse("||<sortable><thead> A || B ||");
    expect(html).not.toContain("<thead>");
    expect(html).toContain("&lt;sortable&gt;&lt;thead&gt; A");
  });
  it("<sortable>만 있으면 셀의 텍스트로 남긴다", () => {
    expect(parse("||<sortable> A || B ||")).toContain(
      "&lt;sortable&gt; A",
    );
  });
  it("<nopad><sortable>은 nopad를 적용한 뒤 sortable에서 옵션 해석을 멈춘다", () => {
    const html = parse("||<nopad><sortable> A || B ||");
    expect(html).toContain('class="wiki-table-nopadding"');
    expect(html).toContain("&lt;sortable&gt; A");
  });
  it("뒤쪽 행에서도 인식한다", () => {
    const html = parse(
      "||<thead> A || B ||\n||<thead><sortable> C || D ||",
    );
    expect(html).toContain('<th class="sortable-table-head-cell"');
  });
  it("<table> 자체에는 클래스를 추가하지 않는다", () => {
    const html = parse("||<thead><sortable> A || B ||");
    expect(html).toContain('<table class="wiki-table">');
    expect(html).not.toContain("wiki-table-sortable");
  });
});

describe("표 옵션 이름별 대소문자 규칙", () => {
  it("<WIDTH=50><NOPAD>는 일반 텍스트로 남긴다", () => {
    const html = parse("||<WIDTH=50><NOPAD> A || B ||");
    expect(html).toContain("&lt;WIDTH=50&gt;&lt;NOPAD&gt; A");
    expect(html).not.toContain("width:50px");
    expect(html).not.toContain("wiki-table-nopadding");
  });
  it("<THEAD>는 일반 텍스트로 남긴다", () => {
    const html = parse("||<THEAD> A || B ||");
    expect(html).toContain("&lt;THEAD&gt; A");
    expect(html).not.toContain("<thead>");
  });
  it("<ROWSPAN=1>은 일반 텍스트로 남긴다", () => {
    const html = parse("||<-2> A ||<ROWSPAN=1> B ||");
    expect(html).toContain("&lt;ROWSPAN=1&gt; B");
    expect(html).not.toContain("rowspan=");
  });
  it("확인한 대문자 옵션 이름 중 BGCOLOR와 COLOR만 인식한다", () => {
    const upperBg = parse("||<BGCOLOR=#fff> A || B ||");
    const lowerBg = parse("||<bgcolor=#fff> A || B ||");
    expect(upperBg).toContain("background-color:#fff");
    expect(upperBg).toContain("data-dark-style");
    expect(upperBg).toBe(lowerBg);

    const upperColor = parse("||<COLOR=red> A ||");
    const lowerColor = parse("||<color=red> A ||");
    expect(upperColor).toBe(lowerColor);
  });
});

describe("표 옵션 해석 중단과 조건에 따라 걸러지는 구역", () => {
  it("rowclass와 rowif가 중복되면 첫 값을 유지하고 뒤의 옵션 해석을 멈춘다", () => {
    const rowClass = parse(
      "||<rowclass=a><rowclass=b><width=40>MARK-CLASS||",
    );
    expect(rowClass).toContain(
      `<tr class="wiki-table-tr ${hashClassName("a")}">`,
    );
    expect(rowClass).toContain("&lt;rowclass=b&gt;&lt;width=40&gt;MARK-CLASS");
    expect(rowClass).not.toContain("width:40px");

    const rowIf = parse("||<rowif=1><rowif=0><width=40>MARK-IF||");
    expect(rowIf).toContain("&lt;rowif=0&gt;&lt;width=40&gt;MARK-IF");
    expect(rowIf).not.toContain("width:40px");
  });

  it("빈 rowif를 일반 텍스트로 남기고 원래 표 구역을 유지한다", () => {
    const html = parse("||<rowif=>MARK||");
    expect(html).toContain("&lt;rowif=&gt;MARK");

    const hidden = parse(
      "||<thead><rowif=0>HIDDEN-HEAD||\n||<rowif=0>HIDDEN-BODY||",
    );
    expect(hidden).toContain("<thead></thead><tbody></tbody>");
    expect(hidden).not.toContain("HIDDEN-HEAD");
    expect(hidden).not.toContain("HIDDEN-BODY");

    const late = parse("||BODY||\n||<thead><rowif=0>LATE||");
    expect(late).not.toContain("<thead>");
    expect(late).toContain("&lt;thead&gt;&lt;rowif=0&gt;LATE");
  });
});

describe("각주 본문 앞의 공백 한 칸", () => {
  it("[1]</a>와 본문 사이에 공백 한 칸을 표시한다", () => {
    const html = parse("x[* 메모]");
    expect(html).toContain('<a href="#rfn-1">&#91;1&#93;</a> 메모</span>');
    expect(html).not.toContain("</a>  메모");
  });
});

describe("각주 링크의 title 속성", () => {
  it("구분 공백을 제외한 각주 본문을 일반 텍스트로 사용한다", () => {
    expect(parse("x[* 메모]")).toContain(
      '<a class="wiki-fn-content" title="메모" href="#fn-1">',
    );
  });

  it("꾸미기 문법을 제거하되 내부 텍스트는 유지하고 리터럴과 매크로는 제거한다", () => {

    const html = parse(
      "x[* 앞 {{{리터럴}}}[br]{{{#red \\\\frac}}} [[문서|보기]] \\{끝]",
    );
    expect(html).toContain('title="앞 \\frac 보기 {끝"');
  });

  it("이름이 같은 각주의 모든 참조에 해당 각주 본문을 표시한다", () => {

    const html = parse("x[*A 텍스트 2] y[*A]") as string;
    expect(html.match(/title="텍스트 2"/g)?.length).toBe(2);
  });
});

describe("루비 주석의 끝 공백 생략", () => {
  it("</ruby> 앞에 공백 없이 <ruby>를 표시한다", () => {
    expect(parse("[ruby(漢字, ruby=かんじ)]")).toContain(
      "<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>",
    );
  });

  it("color=는 <rt> 안의 span에 적용하여 위쪽 글자만 색칠한다", () => {

    expect(parse("[ruby(글자, ruby=루비, color=red)]")).toContain(
      '<ruby>글자<rp>(</rp><rt><span style="color:red">루비</span></rt><rp>)</rp></ruby>',
    );
  });

  it("유효하지 않은 color=는 무시하고 일반 <rt>로 표시한다", () => {
    expect(parse("[ruby(글자, ruby=루비, color=zzz)]")).toContain(
      "<ruby>글자<rp>(</rp><rt>루비</rt><rp>)</rp></ruby>",
    );
  });
});

describe("매크로", () => {
  it("br 줄바꿈 매크로", () => {
    const html = parse("[br]");
    expect(html).toContain("<br>");
  });

  it("clearfix 매크로", () => {
    const html = parse("[clearfix]");
    expect(html).toContain("wiki-clearfix");
  });

  it("anchor 매크로", () => {
    const html = parse("[anchor(target)]");
    expect(html).toContain('<a id="target"></a>');
  });

  it("youtube를 wiki-media 클래스가 있는 iframe으로 표시한다", () => {
    const html = parse("[youtube(VIDEOID)]");
    expect(html).toContain(
      '<iframe class="wiki-media" allowfullscreen="" width="640" height="360" frameborder="0" src="//www.youtube.com/embed/VIDEOID" loading="lazy"></iframe>',
    );
  });

  it("date와 datetime은 오프셋 없는 UTC 텍스트와 UTC ISO 형식의 datetime 속성을 표시한다", () => {
    const dateHtml = parse("[date]") as string;
    const dateText = dateHtml.match(/>([^<]+)<\/time>/)?.[1] ?? "";
    expect(dateText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const dateIso = dateHtml.match(/datetime='(\d{4}-\d{2}-\d{2})T/)?.[1];
    expect(dateText.slice(0, 10)).toBe(dateIso);

    const datetimeHtml = parse("[datetime]") as string;
    const datetimeText = datetimeHtml.match(/>([^<]+)<\/time>/)?.[1] ?? "";
    expect(datetimeText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const datetimeIso = datetimeHtml.match(/datetime='(\d{4}-\d{2}-\d{2})T/)?.[1];
    expect(datetimeText.slice(0, 10)).toBe(datetimeIso);
  });
});

describe("인자가 없어도 인자를 받는 매크로를 인식한다", () => {
  it("인자 없는 [pagecount]를 일반 텍스트 대신 매크로로 처리한다", () => {
    expect(parse("[pagecount]")).not.toContain("pagecount");
  });
  it("인자 없는 [age]는 나이 매크로로 처리하여 invalid date를 표시한다", () => {
    expect(parse("[age]")).toContain("invalid date");
  });
});

describe("동영상 매크로 매개변수", () => {
  it("youtube의 start와 end를 쿼리 매개변수로 전달한다", () => {
    expect(parse("[youtube(ID, start=10, end=20)]")).toContain(
      'src="//www.youtube.com/embed/ID?start=10&end=20"',
    );
  });
  it("px 단위의 width와 height를 속성으로 전달한다", () => {
    const html = parse("[youtube(ID, width=320, height=180)]");
    expect(html).toContain('width="320" height="180"');
  });
  it("첫 두 iframe 속성에서 백분율 크기와 숫자로 시작하는 크기를 유지한다", () => {
    const percent = render(
      "[youtube(WIDTH,width=50%)] [youtube(HEIGHT,height=50%)]",
    );
    const percentFrames = [...percent.querySelectorAll("iframe")];
    expect(percentFrames[0].getAttribute("width")).toBe("50%");
    expect(percentFrames[0].getAttribute("style")).toBeNull();
    expect(percentFrames[1].getAttribute("height")).toBe("50%");

    const prefixed = render(
      "[youtube(WIDTH,width=10;position:fixed)] [youtube(HEIGHT,height=10;color:red)]",
    );
    const prefixedFrames = [...prefixed.querySelectorAll("iframe")];
    expect(prefixedFrames[0].getAttribute("width")).toBe("10");
    expect(prefixedFrames[1].getAttribute("height")).toBe("10");
    expect(prefixedFrames[0].getAttribute("style")).toBeNull();
    expect(prefixedFrames[1].getAttribute("style")).toBeNull();
    expect(prefixed.innerHTML).not.toContain("position:fixed");
    expect(prefixed.innerHTML).not.toContain("color:red");
  });

  it("한 문서의 모든 YouTube 동영상을 iframe으로 표시한다", () => {
    const el = render(
      "{{{#!if 0\n[youtube(HIDDEN)]}}}\n" +
        "[youtube]\n[youtube()]\n[nicovideo(sm9)]\n[navertv(1)]\n[vimeo(1)]\n" +
        "[youtube(ONE)]\n[youtube(TWO)]\n" +
        "[youtube(THREE,start=3,end=4)]\n" +
        "[youtube(FOUR,width=50%)]\n[youtube(FIVE,height=50%)]",
    );
    expect(
      [...el.querySelectorAll('iframe[src*="youtube.com/embed/"]')].map(
        (iframe) => [
          iframe.getAttribute("src"),
          iframe.getAttribute("width"),
          iframe.getAttribute("height"),
          iframe.getAttribute("style"),
        ],
      ),
    ).toEqual([
      ["//www.youtube.com/embed/ONE", "640", "360", null],
      ["//www.youtube.com/embed/TWO", "640", "360", null],
      ["//www.youtube.com/embed/THREE?start=3&end=4", "640", "360", null],
      ["//www.youtube.com/embed/FOUR", "50%", "360", null],
      ["//www.youtube.com/embed/FIVE", "640", "50%", null],
    ]);
    expect(
      [...el.querySelectorAll('iframe:not([src*="youtube.com/embed/"])')].map(
        (iframe) => [
          iframe.getAttribute("src"),
          iframe.getAttribute("width"),
          iframe.getAttribute("height"),
        ],
      ),
    ).toEqual([
      ["//embed.nicovideo.jp/watch/sm9", "720", "480"],
      ["//tv.naver.com/embed/1", "640", "360"],
      ["//player.vimeo.com/video/1", "640", "360"],
    ]);
  });

  it("중복 인자는 첫 값을 사용하고 대상이 비어 있으면 아무것도 출력하지 않는다", () => {
    const first = parse(
      "[youtube(ID, width=100, width=200, start=10, start=20)]",
    );
    expect(first).toContain('width="100"');
    expect(first).toContain("/embed/ID?start=10");
    expect(first).not.toContain('width="200"');
    expect(first).not.toContain("start=20");

    const empty = render("[youtube]\n[youtube()]");
    expect(empty.querySelector("iframe")).toBeNull();
    expect(empty.textContent).toBe("");
  });

  it("KakaoTV는 일반 텍스트로 남기고 NicoVideo는 처음 나오는 연속 ASCII 숫자를 정규화한다", () => {
    const kakao = render("[kakaotv(405064748)]");
    expect(kakao.querySelector("iframe")).toBeNull();
    expect(kakao.textContent).toBe("[kakaotv(405064748)]");

    const nico = render(
      "[nicovideo(xnm12,width=100,width=200)] " +
        "[nicovideo(a12nm34,WIDTH=100)] [nicovideo(sm9,,width=100)] " +
        "[nicovideo(ID)] [nicovideo(１２３)] [nicovideo(１２a3４)]",
    );
    expect(
      [...nico.querySelectorAll("iframe")].map((iframe) => [
        iframe.getAttribute("src"),
        iframe.getAttribute("width"),
        iframe.getAttribute("height"),
      ]),
    ).toEqual([
      ["//embed.nicovideo.jp/watch/nm12", "100", "480"],
      ["//embed.nicovideo.jp/watch/sm12", "720", "480"],
      ["//embed.nicovideo.jp/watch/sm9", "720", "480"],
      ["//embed.nicovideo.jp/watch/sm3", "720", "480"],
    ]);
    expect(nico.textContent).not.toContain("nicovideo");
  });

  it("NicoVideo의 백분율 크기와 쉼표로 끝나는 빈 크기 값을 보존한다", () => {
    const el = render(
      "[nicovideo(sm9,width=50%,height=50%)] " +
        "[nicovideo(sm9,height=,height=234)] " +
        "[nicovideo(sm9,height=)] " +
        "[nicovideo(sm9,\theight=123,width=50%)] " +
        "[nicovideo(sm9,width=,height=123)]",
    );
    expect(
      [...el.querySelectorAll("iframe")].map((iframe) => [
        iframe.getAttribute("width"),
        iframe.getAttribute("height"),
        iframe.getAttribute("style"),
      ]),
    ).toEqual([
      ["50%", "50%", null],
      ["720", "", null],
      ["720", "480", null],
      ["50%", "480", null],
      ["", "123", null],
    ]);
  });
});

describe("[목차(hide)]로 접힌 목차 표시", () => {
  it("hide가 있으면 open 없는 <details>, 없으면 <details open>으로 표시한다", () => {
    const hidden = parse("[목차(hide)]\n== 가 ==");
    expect(hidden).toContain(
      'class="wiki-macro-toc" id="toc"><details><summary>',
    );
    const shown = parse("[목차]\n== 가 ==");
    expect(shown).toContain(
      'class="wiki-macro-toc" id="toc"><details open><summary>',
    );
  });
});

describe("#!wiki의 dark-style과 lang 속성", () => {
  it("dark-style은 data-dark-style로, lang은 lang으로 출력한다", () => {
    expect(
      parse(
        '{{{#!wiki style="color:red" dark-style="color:blue"\nhi\n}}}',
      ),
    ).toContain('<div style="color:red" data-dark-style="color:blue">hi</div>');
    expect(parse('{{{#!wiki lang="ko"\nhi\n}}}')).toContain(
      '<div lang="ko">hi</div>',
    );
  });

  it("style 정규식이 dark-style 안의 style=를 잘못 읽지 않는다", () => {

    const html = parse('{{{#!wiki dark-style="color:blue"\nhi\n}}}');
    expect(html).toContain('<div data-dark-style="color:blue">hi</div>');
    expect(html).not.toContain(' style="');
  });
});

describe("#!syntax의 내장 highlight.js 사용", () => {
  it("허용 목록에 있는 언어의 구문을 강조한다", () => {
    const html = parse("{{{#!syntax python\nprint(1)}}}");
    expect(html).toContain('<pre><code class="hljs" data-language="python">');
    expect(html).toContain('<span class="hljs-built_in">print</span>');
  });

  it("허용 목록의 가장 긴 접두어를 사용하고 남은 부분은 코드의 첫 줄에 둔다", () => {
    const html = parse("{{{#!syntax javascrip\ncode}}}");
    expect(html).toContain(
      '<pre><code class="hljs" data-language="java">scrip\ncode</code></pre>',
    );
  });

  it("언어 이름 뒤의 공백 한 칸을 제거한다", () => {
    const html = parse("{{{#!syntax java script\ncode}}}");
    expect(html).toContain(
      '<pre><code class="hljs" data-language="java">script\ncode</code></pre>',
    );
  });

  it("더 긴 언어 이름을 우선한다 (sh보다 shell)", () => {
    const html = parse("{{{#!syntax shell1\necho x}}}");
    expect(html).toContain('data-language="shell">1\necho x');
  });

  it("알 수 없는 언어는 #!syntax 줄까지 포함한 리터럴 블록으로 표시한다", () => {
    const html = parse("{{{#!syntax js\ncode}}}");
    expect(html).toContain("<pre><code>#!syntax js\ncode</code></pre>");
  });

  it("대소문자를 구분한다", () => {
    const html = parse("{{{#!syntax JAVASCRIPT\ncode}}}");
    expect(html).toContain("<pre><code>#!syntax JAVASCRIPT\ncode</code></pre>");
  });

  it("언어 이름 앞에 정확히 한 칸의 ASCII 공백이 있어야 한다", () => {
    const missingSpace = render("{{{#!syntaxjavascript\ncode}}}");
    const missingSpaceCode = missingSpace.querySelector("pre > code");
    expect(missingSpaceCode?.classList.contains("hljs")).toBe(false);
    expect(missingSpaceCode?.textContent).toBe("#!syntaxjavascript\ncode");

    const twoSpaces = render("{{{#!syntax  javascript\ncode}}}");
    const twoSpacesCode = twoSpaces.querySelector("pre > code");
    expect(twoSpacesCode?.classList.contains("hljs")).toBe(false);
    expect(twoSpacesCode?.textContent).toBe("#!syntax  javascript\ncode");

    const tab = render("{{{#!syntax\tjavascript\ncode}}}");
    const tabCode = tab.querySelector("pre > code");
    expect(tabCode?.classList.contains("hljs")).toBe(false);
    expect(tabCode?.textContent).toBe("#!syntax\tjavascript\ncode");
  });
});

describe("#!if의 구분 공백 경계", () => {
  it("표현식 앞에 ASCII 공백이 있어야 한다", () => {
    expect(parse("{{{#!if 0\nHIDDEN\n}}}")).not.toContain("HIDDEN");

    const missingSpace = render("{{{#!if0\nVISIBLE\n}}}");
    expect(missingSpace.querySelector("pre > code")?.textContent).toBe(
      "#!if0\nVISIBLE\n",
    );

    const tab = render("{{{#!if\t0\nVISIBLE\n}}}");
    expect(tab.querySelector("pre > code")?.textContent).toBe("#!if\t0\nVISIBLE\n");
  });
});

describe("math의 내장 KaTeX 사용", () => {
  it("mhchem을 포함한 TeX를 표시한다", () => {
    const html = parse("[math(\\ce{H2O})]");
    expect(html).toContain('<span class="katex">');
    expect(html).toContain('annotation encoding="application/x-tex">\\ce{H2O}');
  });

  it("<math> 태그도 같은 방식으로 표시한다", () => {
    const html = parse("<math>a^2</math>");
    expect(html).toContain('<span class="katex">');
  });

  it("문서 처리를 중단하지 않고 해석에 실패한 TeX 원문을 빨간색으로 표시한다", () => {
    const html = parse("before [math(\\zzznotacommand)] after");
    expect(html).toContain("<span style='color: red;'>\\zzznotacommand</span>");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });
});

describe("#!latex의 KaTeX 블록 수식 모드", () => {
  it("본문을 블록 수식 모드로 표시한다", () => {
    const html = parse("{{{#!latex\n\\frac12\n}}}");
    expect(html).toContain('<span class="katex-display">');
    expect(html).toContain('display="block"');
  });

  it("끝의 줄바꿈까지 TeX 원문을 그대로 유지한다", () => {
    const html = parse("{{{#!latex\na^2\n}}}");
    expect(html).toContain(
      'annotation encoding="application/x-tex">a^2\n</annotation>',
    );

    const tight = parse("{{{#!latex\na^2}}}");
    expect(tight).toContain(
      'annotation encoding="application/x-tex">a^2</annotation>',
    );
  });

  it("문서 처리를 중단하지 않고 해석에 실패한 TeX 원문을 빨간색으로 표시한다", () => {
    const html = parse(
      "before\n{{{#!latex\n\\zzznotacommand\n}}}\nafter",
    );
    expect(html).toContain(
      "<span style='color: red;'>\\zzznotacommand\n</span>",
    );
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("키워드는 소문자만 허용하고 뒤에 추가 지정값을 받지 않는다", () => {

    expect(parse("{{{#!latex x}}}")).toContain("<code>#!latex x</code>");
    expect(parse("{{{#!latex \nx\n}}}")).toContain(
      "<pre><code>#!latex \nx\n</code></pre>",
    );
    expect(parse("{{{#!LATEX\nx\n}}}")).toContain(
      "<pre><code>#!LATEX\nx\n</code></pre>",
    );
    expect(parse("{{{#!Latex\nx\n}}}")).toContain(
      "<pre><code>#!Latex\nx\n</code></pre>",
    );
  });

  it("#!if와 #!wiki 안에 중첩할 수 있고 문단 안에도 놓을 수 있다", () => {
    expect(parse("{{{#!if 1\n{{{#!latex\nx^2\n}}}\n}}}")).toContain(
      '<span class="katex-display">',
    );
    expect(parse("{{{#!if 0\n{{{#!latex\nx^2\n}}}\n}}}")).not.toContain(
      '<span class="katex-display">',
    );
    const el = render(
      '{{{#!wiki style="color:red"\n{{{#!latex\n\\alpha\n}}}\n}}}',
    );
    expect(el.querySelector("div > .katex-display")).not.toBeNull();
    const inline = render("앞 {{{#!latex\nx\n}}} 뒤");
    expect(
      inline.querySelector(".wiki-paragraph > .katex-display"),
    ).not.toBeNull();
    expect(inline.textContent).toContain("앞");
    expect(inline.textContent).toContain("뒤");
  });

  it("원문 보존 직렬화로 바이트 단위까지 동일하게 복원한다", async () => {
    const { serialize, Lexer } = await import("../src/namumark.ts");
    expect(serialize(Lexer.lex("{{{#!latex\n\\frac12\n}}}"))).toBe(
      "{{{#!latex\n\\frac12\n}}}",
    );
    expect(serialize(Lexer.lex("앞 {{{#!latex\nE = mc^2\n}}} 뒤\n"))).toBe(
      "앞 {{{#!latex\nE = mc^2\n}}} 뒤\n",
    );
    expect(
      serialize(
        Lexer.lex(
          "||<tablealign=center> {{{#!latex\n\\begin{aligned}\na &= b\n\\end{aligned}\n}}} ||\n",
        ),
      ),
    ).toBe(
      "||<tablealign=center> {{{#!latex\n\\begin{aligned}\na &= b\n\\end{aligned}\n}}} ||\n",
    );
    expect(serialize(Lexer.lex("{{{#!latex\n{{{nested}}}\n}}}"))).toBe(
      "{{{#!latex\n{{{nested}}}\n}}}",
    );
  });
});

describe("HTML 이스케이프 대상 일곱 문자", () => {
  it("리터럴 블록 안의 &, <, >, 큰따옴표, 작은따옴표, [, ]를 이스케이프한다", () => {
    const html = parse(`{{{리터럴 & < > " ' [ ] 기호}}}`);
    expect(html).toContain(
      "<code>리터럴 &amp; &lt; &gt; &quot; &#39; &#91; &#93; 기호</code>",
    );
  });

  it("일반 텍스트의 대괄호를 이스케이프한다", () => {
    expect(parse("대괄호 [ 와 ] 기호")).toContain(
      "대괄호 &#91; 와 &#93; 기호",
    );
  });

  it("작성자가 입력한 엔티티를 해석하지 않는다", () => {
    expect(parse("&#91;")).toContain("&amp;#91;");
  });

  it("링크의 title 속성에 있는 대괄호를 이스케이프한다", () => {
    const html = parse("[[[12:00]#]]");
    expect(html).toContain('href="/w/%5B12:00%5D" title="&#91;12:00&#93;"');
  });

  it("각주 이름과 돌아가기 링크를 이스케이프한다", () => {
    const html = parse("x[* 메모]\n[각주]\n");
    expect(html).toContain('<span id="rfn-1"></span>&#91;1&#93;</a>');
    expect(html).toContain('<a href="#rfn-1">&#91;1&#93;</a> 메모</span>');
  });

  it("문단별 편집 링크를 이스케이프한다", () => {
    const html = parse("== 개요 ==", { title: "나무위키" });
    expect(html).toContain('rel="nofollow">&#91;편집&#93;</a>');
  });

  it("KaTeX와 hljs 출력을 그대로 유지한다", () => {

    const tex = parse("[math(\\sqrt[n]x)]");
    expect(tex).toContain(
      '<annotation encoding="application/x-tex">\\sqrt[n]x</annotation>',
    );

    const code = parse(
      "{{{#!syntax python\ndef f(x):\n    return x  # 주석 & <기호>\n}}}",
    );
    expect(code).toContain(
      '<span class="hljs-comment"># 주석 &amp; &lt;기호&gt;</span>',
    );
  });
});
