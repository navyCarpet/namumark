import { describe, expect, it } from "vitest";
import {
  filterGlobalCss,
  filterInlineCss,
  hashClassName,
} from "../src/renderer/css.ts";
import { parse } from "../src/namumark.ts";
import type { Token, Tokens } from "../src/Tokens.ts";

function render(src: string) {
  const html = parse(src) as string;
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("인라인 CSS 필터의 속성 허용 목록", () => {
  it("허용하지 않는 속성의 선언만 제거한다", () => {
    expect(filterInlineCss("position:fixed;color:red")).toBe("color:red");
    expect(filterInlineCss("color:red;position:fixed;top:1px")).toBe(
      "color:red",
    );
  });

  it("나무위키 자체 문서에 누락된 속성을 유지한다", () => {
    expect(filterInlineCss("flex-basis:10px")).toBe("flex-basis:10px");
    expect(filterInlineCss("grid-template-columns:1fr 1fr")).toBe(
      "grid-template-columns:1fr 1fr",
    );
  });

  it("공백을 정리하고 값은 그대로 유지한다", () => {
    expect(filterInlineCss("color: red ; width:calc(1px + 1px)")).toBe(
      "color:red;width:calc(1px + 1px)",
    );
  });
});

describe("인라인 CSS 필터의 값 허용 목록", () => {
  it("display:flex는 허용하고 display:grid는 제거한다", () => {
    expect(filterInlineCss("display:flex")).toBe("display:flex");
    expect(filterInlineCss("color:red;display:grid")).toBe("color:red");
  });

  it("도움말의 각주와 달리 text-align:justify를 허용한다", () => {
    expect(filterInlineCss("text-align:justify")).toBe("text-align:justify");
  });

  it("overflow:clip은 제거하고 overflow:overlay는 허용한다", () => {
    expect(filterInlineCss("color:red;overflow:clip")).toBe("color:red");
    expect(filterInlineCss("overflow:overlay")).toBe("overflow:overlay");
  });

  it("flex-grow에 숫자는 허용하고 지수 표기는 제거한다", () => {
    expect(filterInlineCss("flex-grow:-1")).toBe("flex-grow:-1");
    expect(filterInlineCss("flex-shrink:.5")).toBe("flex-shrink:.5");
    expect(filterInlineCss("color:red;flex-grow:1e3")).toBe("color:red");
  });

  it("color를 포함해 값을 검사하지 않는 118개 속성은 임의의 값을 허용한다", () => {
    expect(filterInlineCss("float:zzzz;color:zzzz")).toBe(
      "float:zzzz;color:zzzz",
    );
  });

  it("서버처럼 white-space 값의 대소문자를 구분한다", () => {

    expect(filterInlineCss("white-space:normal;color:red")).toBe(
      "white-space:normal;color:red",
    );
    expect(filterInlineCss("white-space:nowrap;color:red")).toBe(
      "white-space:nowrap;color:red",
    );
    expect(filterInlineCss("white-space:pre;color:red")).toBe(
      "white-space:pre;color:red",
    );
    expect(filterInlineCss("white-space:pre-wrap;color:red")).toBe(
      "white-space:pre-wrap;color:red",
    );
    expect(filterInlineCss("white-space:pre-line;color:red")).toBe(
      "white-space:pre-line;color:red",
    );
    expect(filterInlineCss("white-space:break-spaces;color:red")).toBe(
      "white-space:break-spaces;color:red",
    );
    expect(filterInlineCss("white-space:initial;color:red")).toBe(
      "white-space:initial;color:red",
    );
    expect(filterInlineCss("white-space:inherit;color:red")).toBe(
      "white-space:inherit;color:red",
    );
    expect(filterInlineCss("white-space:unset;color:red")).toBe(
      "white-space:unset;color:red",
    );
    expect(filterInlineCss("white-space:revert;color:red")).toBe(
      "white-space:revert;color:red",
    );
    expect(filterInlineCss("white-space:revert-layer;color:red")).toBe(
      "white-space:revert-layer;color:red",
    );
    expect(filterInlineCss("white-space:collapse;color:red")).toBe(
      "white-space:collapse;color:red",
    );
    expect(filterInlineCss("white-space:wrap;color:red")).toBe(
      "white-space:wrap;color:red",
    );
    expect(filterInlineCss("white-space:preserve nowrap;color:red")).toBe(
      "white-space:preserve nowrap;color:red",
    );
    expect(filterInlineCss("white-space:normal !important;color:red")).toBe(
      "white-space:normal !important;color:red",
    );
    expect(filterInlineCss("white-space:initial !important;color:red")).toBe(
      "white-space:initial !important;color:red",
    );
    expect(filterInlineCss("white-space:preserve;color:red")).toBe("color:red");
    expect(filterInlineCss("white-space:preserve-breaks;color:red")).toBe("color:red");
    expect(filterInlineCss("white-space:preserve-spaces;color:red")).toBe("color:red");
    expect(filterInlineCss("white-space:pre wrap;color:red")).toBe("color:red");
    expect(filterInlineCss("white-space:PRE;color:red")).toBe("color:red");
    expect(filterInlineCss("white-space:zzzz;color:red")).toBe("color:red");

  });
});

describe("인라인 CSS 필터의 값 길이 제한", () => {
  const rgba = (n: number) => `rgba(0,0,0,0.${"0".repeat(n)}1)`;

  it("color 값은 64자까지 허용한다", () => {
    expect(filterInlineCss(`color:${rgba(49)}`)).toBe(`color:${rgba(49)}`);
    expect(filterInlineCss(`width:1px;color:${rgba(50)}`)).toBe("width:1px");
  });

  it("box-shadow 값은 기본 제한인 32자까지 허용한다", () => {
    const ok = "inset 0 0 0 red,inset 0 0 0 blue";
    const over = "inset 0 0 0 red,inset 0 0 0 green";
    expect(filterInlineCss(`box-shadow:${ok}`)).toBe(`box-shadow:${ok}`);
    expect(filterInlineCss(`color:red;box-shadow:${over}`)).toBe("color:red");
  });

  it("!important는 값의 길이에 포함하지 않는다", () => {

    const v = "a".repeat(25);
    expect(filterInlineCss(`box-shadow:${v} !important`)).toBe(
      `box-shadow:${v} !important`,
    );
    expect(filterInlineCss(`box-shadow:${v}`)).toBe(`box-shadow:${v}`);

    expect(filterInlineCss(`box-shadow:${"a".repeat(33)} !important`)).toBe("");
  });
});

describe("인라인 CSS 필터의 선언 경계", () => {
  it("주석 안의 ;는 선언을 나누지 않으며 해당 주석은 제거한다", () => {

    expect(filterInlineCss("color:red/*;position:fixed*/;height:1px")).toBe(
      "color:red;height:1px",
    );

    expect(filterInlineCss("color:red;/*x*/position:fixed")).toBe("color:red");
  });

  it("이스케이프 문자로 끝나는 값은 선언으로 인정하지 않는다", () => {

    expect(filterInlineCss("font-family:\\")).toBe("");
  });
});

describe("인라인 CSS 필터의 url()과 expression() 처리", () => {
  it("url()이 있으면 스타일 전체를 제거한다", () => {
    expect(filterInlineCss("color:red;background-image:url(x)")).toBe("");
    expect(
      filterInlineCss(
        "color:red;background-image:url(data:image/gif;base64,A)",
      ),
    ).toBe("");
  });

  it("expression()이 있으면 스타일 전체를 제거한다", () => {
    expect(filterInlineCss("color:red;max-width:expression(alert(1))")).toBe(
      "",
    );
  });

  it("값 안의 주석을 유지하고 출력할 문자열을 검사한다", () => {
    expect(filterInlineCss("background:u/**/rl(//x/pixel)")).toBe(
      "background:u/**/rl(//x/pixel)",
    );
    expect(filterInlineCss("color:red/*x*/blue")).toBe("color:red/*x*/blue");

    expect(filterInlineCss("background-image:/*x*/url(//x/a)")).toBe("");

    expect(filterInlineCss("color:red/*;background-image:url(//x/a)*/")).toBe(
      "color:red",
    );

    expect(filterInlineCss("color:red;background-color:blue/*x")).toBe("");
  });

  it("the seed처럼 src()와 image()와 image-set()을 허용한다", () => {
    expect(filterInlineCss("background-image:src('//x/a')")).toBe(
      "background-image:src('//x/a')",
    );
    expect(filterInlineCss("background-image:image('//x/a')")).toBe(
      "background-image:image('//x/a')",
    );
    expect(filterInlineCss("background-image:image-set('//x/a' 1x)")).toBe(
      "background-image:image-set('//x/a' 1x)",
    );
    expect(
      filterInlineCss("background-image:-webkit-image-set('//x/a' 1x)"),
    ).toBe("background-image:-webkit-image-set('//x/a' 1x)");
    expect(filterInlineCss("background-image:\\69 mage-set('//x/a' 1x)")).toBe(
      "background-image:\\69 mage-set('//x/a' 1x)",
    );
    expect(
      filterGlobalCss(".a { background-image: image-set('//x/a' 1x); }"),
    ).not.toBe("");
  });

  it("값을 먼저 검사하므로 cursor:url()은 해당 선언만 제거한다", () => {
    expect(filterInlineCss("color:red;cursor:url(https://x/c.png)")).toBe(
      "color:red",
    );
  });

  it("정의되지 않은 함수와 !important를 허용한다", () => {
    expect(filterInlineCss("width:zzzfunc(1)")).toBe("width:zzzfunc(1)");
    expect(filterInlineCss("width:éimage(1)")).toBe("width:éimage(1)");
    expect(filterInlineCss("color:red !important;width:10px !important")).toBe(
      "color:red !important;width:10px !important",
    );
  });
});

describe("전역 #!style 필터", () => {
  const h = hashClassName;

  it("일반 규칙에 적용 범위를 지정하고 클래스 이름을 해시로 변환한다", () => {
    expect(filterGlobalCss(".note { color: green; }")).toBe(
      `.wiki[class] .${h("note")}{color:green;}`,
    );
  });

  it("@import는 제거하고 @media의 내용은 펼치며 @theseed-dark-mode에는 접두 선택자를 붙인다", () => {
    expect(
      filterGlobalCss(
        "@import url(https://example.com/x.css);\n" +
          "@media (min-width: 1px) { .a { color: blue; } }\n" +
          ".a:hover { color: green; }\n" +
          "@theseed-dark-mode { .a { color: white; } }",
      ),
    ).toBe(
      `.wiki[class] .${h("a")}{color:blue;}` +
        `.wiki[class] .${h("a")}:hover{color:green;}` +
        `.theseed-dark-mode .wiki[class] .${h("a")}{color:white;}`,
    );
  });

  it("관찰된 블록형 @규칙의 내용을 펼치고 다크 모드 규칙을 정확히 구분한다", () => {

    const plain = `.wiki[class] .${h("a")}{color:red;}`;
    expect(filterGlobalCss("@media (min-width:1px) { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@mediax test { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@MEDIA test { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@supports (color:red) { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@supportsX test { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@theseed-dark-modex { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@THESEED-DARK-MODE { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@container test { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@layer test { .a { color:red; } }")).toBe(plain);
    expect(filterGlobalCss("@unknown test { .a { color:red; } }")).toBe(plain);

    expect(filterGlobalCss("@theseed-dark-mode { .a { color:red; } }")).toBe(
      `.theseed-dark-mode ${plain}`,
    );
    expect(
      filterGlobalCss(
        "@keyframes spin { from { color:red; } to { color:blue; } }",
      ),
    ).toBe("");
  });

  it("허용된 태그 9개를 유지하고 복합 선택자에서 나머지 태그를 제거한다", () => {
    expect(filterGlobalCss("table.a > thead > tr { color: red; }")).toBe(
      `.wiki[class] table.${h("a")} > thead > tr{color:red;}`,
    );

    expect(
      filterGlobalCss(
        ".a strong { color: red; }\n.a > strong { color: blue; }",
      ),
    ).toBe(
      `.wiki[class] .${h("a")}{color:red;}.wiki[class] .${h("a")}{color:blue;}`,
    );
  });

  it("#id와 가상 선택자는 유지하고 [attr]과 :not()과 *는 제거한다", () => {
    expect(filterGlobalCss("#toc { display: none; }")).toBe(
      ".wiki[class] #toc{display:none;}",
    );
    expect(filterGlobalCss(".a::before:hover { color: red; }")).toBe(
      `.wiki[class] .${h("a")}::before:hover{color:red;}`,
    );
    expect(filterGlobalCss(".a[data-x] { color: red; }")).toBe(
      `.wiki[class] .${h("a")}{color:red;}`,
    );
    expect(filterGlobalCss(".a:not(.x) { color: red; }")).toBe(
      `.wiki[class] .${h("a")}{color:red;}`,
    );
    expect(filterGlobalCss(".a * { color: red; }")).toBe(
      `.wiki[class] .${h("a")}{color:red;}`,
    );

    expect(filterGlobalCss("* { color: red; }")).toBe("");
    expect(filterGlobalCss("[id=x] { color: red; }")).toBe("");
  });

  it("모든 선언이 제거된 규칙은 제거한다", () => {
    expect(filterGlobalCss('.a::before { content: "x"; }')).toBe("");
  });

  it("어느 규칙이든 url()이 있으면 블록 전체를 제거한다", () => {
    expect(
      filterGlobalCss(
        ".a { color: green; }\n.a:hover { background-image: url(x.png); }",
      ),
    ).toBe("");
  });
});

describe("CSS 필터의 전체 처리 흐름", () => {
  it("#!wiki의 style 값을 검사하며 결과가 비어도 빈 속성을 유지한다", () => {
    expect(
      parse('{{{#!wiki style="position:fixed;color:red"\nhi\n}}}'),
    ).toContain('<div style="color:red">hi</div>');

    expect(
      parse('{{{#!wiki style="background-image:url(x)"\nhi\n}}}'),
    ).toContain('<div style="">hi</div>');
    expect(parse('{{{#!wiki style="position:fixed"\nhi\n}}}')).toContain(
      '<div style="">hi</div>',
    );

    expect(
      parse('{{{#!wiki style="font-family:\\"a;b\\";color:red"\nhi\n}}}'),
    ).toContain('<div style="">hi</div>');

    expect(parse("{{{#!wiki\nhi\n}}}")).toContain("<div>hi</div>");
    expect(parse('{{{#!wiki class="c"\nhi\n}}}')).not.toContain("style=");
  });

  it("dark-style을 지정하지 않으면 속성을 출력하지 않는다", () => {
    expect(parse('{{{#!wiki style="color:red"\nhi\n}}}')).not.toContain(
      "data-dark-style",
    );
    expect(parse("|| a ||")).not.toContain("data-dark-style");
  });

  it("border-image의 그라데이션은 색상 종류와 관계없이 값이 32자를 넘으면 제거한다", () => {
    expect(
      filterInlineCss("color:red;border-image:linear-gradient(red,blue) 1"),
    ).toBe("color:red;border-image:linear-gradient(red,blue) 1");
    expect(
      filterInlineCss("color:red;border-image:linear-gradient(#fff,#c00) 1"),
    ).toBe("color:red;border-image:linear-gradient(#fff,#c00) 1");
    expect(
      filterInlineCss(
        "color:red;border-image:linear-gradient(#ffffff,#cc0000) 1",
      ),
    ).toBe("color:red");
    expect(
      filterInlineCss(
        "color:red;border-image:linear-gradient(rgb(255,0,0),blue) 1",
      ),
    ).toBe("color:red");

    expect(
      filterInlineCss(
        "color:red;background-image:linear-gradient(#ffffff,#cc0000)",
      ),
    ).toBe("color:red;background-image:linear-gradient(#ffffff,#cc0000)");
    expect(
      filterInlineCss(
        "color:red;background-image:linear-gradient(rgb(255,0,0),blue)",
      ),
    ).toBe("color:red;background-image:linear-gradient(rgb(255,0,0),blue)");
  });

  it("길이 제한 안의 6자리 16진수 그라데이션은 유지한다", () => {
    expect(
      filterInlineCss("color:red;border-image:linear-gradient(#ffffff,red)"),
    ).toBe("color:red;border-image:linear-gradient(#ffffff,red)");
  });

  it("#!html의 style 속성에도 같은 필터를 적용한다", () => {
    expect(
      parse(
        '{{{#!html <span style="position:fixed;color:red">s</span>}}}',
      ),
    ).toContain('<span style="color:red">s</span>');
    expect(
      parse('{{{#!html <span style="position:fixed">s</span>}}}'),
    ).toContain("<span>s</span>");
  });

  it("주석으로 나뉜 함수 이름은 그대로 유지한다", () => {
    expect(
      parse('{{{#!wiki style="background:u/**/rl(//x/pixel)"\ns\n}}}'),
    ).toContain('<div style="background:u/**/rl(//x/pixel)">s</div>');
  });

  it("#!style에 남은 규칙이 없으면 style 요소를 출력하지 않는다", () => {
    expect(
      parse("{{{#!style\n.a { background: url(x); }\n}}}"),
    ).not.toContain("<style>");
    expect(parse("{{{#!style\nbody { color: red; }\n}}}")).not.toContain(
      "<style>",
    );
    expect(parse("{{{#!style\n.a { color: red; }\n}}}")).toContain(
      `<style>.wiki[class] .${hashClassName("a")}{color:red;}</style>`,
    );
  });

  it("대상이나 클래스 인수가 빠진 onclick 동작은 제거한다", () => {

    const html = parse(
      '{{{#!wiki class="dig" onclick="add-class,flag,mine-mode;remove-class,dig,mine-mode;add-class;add-class,mine-flag,mine-hide;remove-class,cell,mine-hide"\nx\n}}}',
    ) as string;
    const value = /data-onclick="([^"]*)"/.exec(html)![1];
    expect(value.split(";").length).toBe(4);
    expect(value).toBe(
      [
        `add-class,${hashClassName("flag")},${hashClassName("mine-mode")}`,
        `remove-class,${hashClassName("dig")},${hashClassName("mine-mode")}`,
        `add-class,${hashClassName("mine-flag")},${hashClassName("mine-hide")}`,
        `remove-class,${hashClassName("cell")},${hashClassName("mine-hide")}`,
      ].join(";"),
    );

    expect(parse('{{{#!wiki onclick="add-class"\nx\n}}}')).not.toContain(
      "data-onclick",
    );
  });

  it("형식이 잘못된 onclick 동작부터 뒤의 동작을 모두 제거한다", () => {

    const o11 = parse('{{{#!wiki onclick="add-class,x,y"\nn1\n}}}') as string;
    expect(/data-onclick="([^"]*)"/.exec(o11)![1]).toBe(
      `add-class,${hashClassName("x")},${hashClassName("y")}`,
    );

    expect(
      parse(
        '{{{#!wiki class="k1" onclick="toggle-class,a,b,c; add-class,x,y"\nn2\n}}}',
      ),
    ).not.toContain("data-onclick");

    expect(
      parse('{{{#!wiki class="k2" onclick="add-class,x"\nn3\n}}}'),
    ).not.toContain("data-onclick");

    expect(
      parse('{{{#!wiki class="k3" onclick="zzz-op,a,b"\nn4\n}}}'),
    ).not.toContain("data-onclick");

    const o15 = parse(
      '{{{#!wiki class="k4" onclick="add-class,x,y; toggle-class,a,b,c"\nn5\n}}}',
    ) as string;
    expect(/data-onclick="([^"]*)"/.exec(o15)![1]).toBe(
      `add-class,${hashClassName("x")},${hashClassName("y")}`,
    );
  });

  it("#!wiki의 style과 class와 onclick 안의 @param@을 치환한다", () => {

    const attrs =
      '{{{#!wiki style="margin-top:@q@px" class="k@q@" onclick="toggle-class,a@q@,b"\nattrsub\n}}}';
    const html = parse(`{{{#!if q = 7\n}}}${attrs}${attrs}`) as string;
    expect(html.match(/style="margin-top:7px"/g)!.length).toBe(2);
    expect(html.match(new RegExp(hashClassName("k7"), "g"))!.length).toBe(2);
    expect(
      html.match(
        new RegExp(
          `toggle-class,${hashClassName("a7")},${hashClassName("b")}`,
          "g",
        ),
      )!.length,
    ).toBe(2);

    const other = parse(
      `{{{#!if r = 8\n}}}${attrs.replace(/@q@/g, "@r@")}`,
    );
    expect(other).toContain('style="margin-top:8px"');
    expect(other).toContain(
      `toggle-class,${hashClassName("a8")},${hashClassName("b")}`,
    );

    expect(
      parse('{{{#!wiki style="margin-top:@nope@px"\nx\n}}}'),
    ).toContain('style="margin-top:px"');
    expect(parse('{{{#!wiki class="k@zz@"\nx\n}}}')).toContain(
      hashClassName("k"),
    );
  });

  it("dark-style과 lang 안의 @param@도 치환한다", () => {

    const html = parse(
      '{{{#!if q9 = 3\n}}}{{{#!wiki dark-style="margin-top:@q9@px" lang="ko@q9@"\ndarkattr}}}',
    );
    expect(html).toContain('data-dark-style="margin-top:3px"');
    expect(html).toContain('lang="ko3"');

    expect(
      parse('{{{#!wiki dark-style="margin-top:@nope3@px"\nzx}}}'),
    ).toContain('data-dark-style="margin-top:px"');

    const tagged = parse(
      "{{{#!if tg = 'span'\n}}}{{{#!wiki tag=\"@tg@\"\nTAGSUB}}}",
    );
    expect(tagged).toContain("<div>TAGSUB</div>");
    expect(tagged).not.toContain("<span>TAGSUB</span>");
  });

  it("</style>을 넣어도 style 요소 밖으로 나갈 수 없다", () => {
    const html = parse(
      '{{{#!style\n.a { font-family: "</style><script>"; }\n}}}',
    );
    expect(html).not.toContain("</style><script>");
  });

  it("서버처럼 <를 \\x3C로 이스케이프한다", () => {
    const html = parse(
      '{{{#!style\n.a { font-family: "</style><script>"; }\n}}}',
    );
    expect(html).toContain('font-family:"\\x3C/style>\\x3Cscript>";');
  });
});

describe("HTML 블록의 기본 정화 처리", () => {
  it("허용된 태그를 유지한다", () => {
    const el = render("{{{#!html <b>bold</b>}}}");
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("이벤트 처리기 속성을 제거하고 script 내용도 모두 제거한다", () => {
    const html = parse(
      `{{{#!html <b onclick="x">a</b><script>bad</script>}}}`,
    );
    expect(html).toContain("<b>a</b>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("bad");
  });

  it("javascript: 주소는 제거하고 외부 링크에 지정되는 속성은 유지한다", () => {
    const html = parse(
      `{{{#!html <a href="javascript:alert(1)" onclick="x()">y</a>}}}`,
    );
    expect(html).toContain(
      '<a target="_blank" rel="nofollow noopener ugc" class="wiki-link-external">y</a>',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
  });

  it("관찰된 형태의 링크 URL만 유지한다", () => {

    const el = render(
      '{{{#!html <a href="http://example.com/x">0</a>' +
        '<a href="https://example.com/x">1</a>' +
        '<a href="HTTP://example.com/x">2</a>' +
        '<a href="//example.com/x">3</a>' +
        '<a href="/w/x">4</a>' +
        '<a href="relative/path">5</a>' +
        '<a href="ftp://example.com/x">6</a>' +
        '<a href="mailto:a@example.com">7</a>' +
        '<a href="tel:123">8</a>' +
        '<a href="javascript:alert(1)">9</a>' +
        '<a href="JaVaScRiPt:alert(1)">10</a>' +
        '<a href="data:text/html,x">11</a>' +
        '<a href="blob:https://example.com/id">12</a>' +
        '<a href="file:///tmp/x">13</a>}}}',
    );
    expect(
      Array.from(el.querySelectorAll("a"), (anchor) =>
        anchor.getAttribute("href"),
      ),
    ).toEqual([
      "http://example.com/x",
      "https://example.com/x",
      "HTTP://example.com/x",
      "//example.com/x",
      "/w/x",
      "relative/path",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("iframe의 HTTP 대소문자와 src 누락에 따른 리디렉션 주소를 정확히 만든다", () => {

    const el = render(
      '{{{#!html <iframe src="http://example.com/x"></iframe>' +
        '<iframe src="https://example.com/x"></iframe>' +
        '<iframe src="HTTP://example.com/x"></iframe>' +
        '<iframe src="HTTPS://example.com/x"></iframe>' +
        '<iframe src="//example.com/x"></iframe>' +
        '<iframe src="javascript:alert(1)"></iframe>' +
        '<iframe src="data:text/html,x"></iframe>' +
        '<iframe src="blob:https://example.com/id"></iframe>' +
        "<iframe></iframe>}}}",
    );
    expect(
      Array.from(el.querySelectorAll("iframe"), (iframe) =>
        iframe.getAttribute("src"),
      ),
    ).toEqual([
      "/redirect/%2F%2Fexample.com%2Fx",
      "/redirect/https%3A%2F%2Fexample.com%2Fx",
      "/redirect/HTTP%3A%2F%2Fexample.com%2Fx",
      "/redirect/HTTPS%3A%2F%2Fexample.com%2Fx",
      "/redirect/%2F%2Fexample.com%2Fx",
      "/redirect/javascript%3Aalert(1)",
      "/redirect/data%3Atext%2Fhtml%2Cx",
      "/redirect/blob%3Ahttps%3A%2F%2Fexample.com%2Fid",
      "/redirect/undefined",
    ]);
  });

  it("허용 목록에 없는 태그를 제거하고 텍스트는 유지한다", () => {
    const html = parse(`{{{#!html <img src="x" onerror="alert(1)">t}}}`);
    expect(html).not.toContain("<img");
    expect(html).toContain("t");
  });
});

describe("보안 회귀 검사", () => {
  it("생성할 속성에 넣기 전에 prefix를 이스케이프한다", () => {
    const html = parse("= h =", {
      prefix: 'p"><img src=x onerror="globalThis.__pwned=1">',
    }) as string;
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("img")).toBeNull();
    expect(html).not.toContain("<img");
  });

  it("내부 링크 주소는 지정된 경로 접두사 안에 유지한다", () => {

    const html = parse("[[문서:../../admin|관리 문서]]") as string;
    const container = document.createElement("div");
    container.innerHTML = html;
    const href = container.querySelector("a")!.getAttribute("href")!;
    expect(href).toBe("/w?doc=%EB%AC%B8%EC%84%9C:..%2F..%2Fadmin");
    expect(
      new URL(href, "https://wiki.example").pathname.startsWith("/w"),
    ).toBe(true);

    const file = parse("[[파일:x/../../admin.png]]", {
      async: false,
      walkTokens: (token: Token) => {
        if (token.type === "link") (token as Tokens.Link).kind = "file";
      },
    });
    expect(file).toContain(
      'href="/w?doc=%ED%8C%8C%EC%9D%BC:x/..%2F..%2Fadmin.png"',
    );
  });

  it("허용 목록을 확인할 때 Object.prototype의 속성을 사용하지 않는다", () => {
    expect(parse("[constructor]A")).toContain("&#91;constructor&#93;A");
    expect(parse("||<bgcolor=constructor>x||")).toContain(
      "&lt;bgcolor=constructor&gt;",
    );
  });

  it("URL 인코딩 전에 짝이 없는 UTF-16 서로게이트를 대체한다", () => {
    expect(parse("[[\ud800]]")).toContain('href="/w/%EF%BF%BD"');
    expect(parse("[[#\udfff]]")).toContain('href="#%EF%BF%BD"');
    const footnote = parse("[*\ud800 x]") as string;
    expect(footnote).toContain('href="#fn-%ef%bf%bd"');
    const footnoteContainer = document.createElement("div");
    footnoteContainer.innerHTML = footnote;
    const footnoteHref = footnoteContainer
      .querySelector<HTMLAnchorElement>('a[href^="#fn-"]')!
      .getAttribute("href")!;
    const footnoteTarget = decodeURIComponent(footnoteHref.slice(1));
    expect(
      Array.from(footnoteContainer.querySelectorAll("[id]")).some(
        (element) => element.id === footnoteTarget,
      ),
    ).toBe(true);
    expect(
      parse('{{{#!html <iframe src="\ud800"></iframe>}}}'),
    ).toContain('src="/redirect/%EF%BF%BD"');
    expect(parse("= h =", { title: "\ud800" })).toContain(
      'href="/edit/%EF%BF%BD?section=1"',
    );
    const anchor = parse("[anchor(\ud800)][[#\ud800]]") as string;
    const anchorContainer = document.createElement("div");
    anchorContainer.innerHTML = anchor;
    const anchorHref = anchorContainer
      .querySelector<HTMLAnchorElement>('a[href^="#"]')!
      .getAttribute("href")!;
    expect(
      Array.from(anchorContainer.querySelectorAll("[id]")).some(
        (element) => element.id === decodeURIComponent(anchorHref.slice(1)),
      ),
    ).toBe(true);
    expect(parse("[[😀]]")).toContain('href="/w/%F0%9F%98%80"');
  });
});

describe("#!wiki 인라인 스타일의 기본 CSS 필터", () => {
  it("허용 목록에 없는 속성의 선언을 제거한다", () => {
    const html = parse(
      '{{{#!wiki style="color:red;position:fixed"\nhi\n}}}',
    );
    expect(html).toContain('style="color:red"');
    expect(html).not.toContain("position");
  });

  it("dark-style도 검사하며 결과가 비면 속성을 출력하지 않는다", () => {
    const html = parse(
      '{{{#!wiki style="color:red" dark-style="position:fixed"\nhi\n}}}',
    );
    expect(html).toContain('style="color:red"');
    expect(html).not.toContain("data-dark-style");
  });
});
