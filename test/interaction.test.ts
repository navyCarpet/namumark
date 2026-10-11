import { describe, expect, it } from "vitest";
import { parse } from "../src/namumark.ts";

function render(src: string) {
  const html = parse(src) as string;
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("목록·들여쓰기·인용문 안에서 여러 줄에 걸친 표 행", () => {
  it("행의 나머지 줄을 목록 항목에 그대로 붙이고 공백은 셀 안의 들여쓰기로 처리한다", () => {
    const html = parse(" * A\n ||x\n y ||\nd");
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x</div>' +
        '<div class="wiki-indent"><div class="wiki-paragraph">y</div></div></td>',
    );
    expect(html).toContain('<div class="wiki-paragraph">d</div>');
  });

  it("들여쓰기 없는 줄도 목록을 끝내지 않고 표 행을 이어 간다", () => {
    const html = parse(" * A\n ||x\ny ||\nz");
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );
    expect(html).toContain('<div class="wiki-paragraph">z</div>');
  });

  it("얕은 단계의 목록 기호도 표 행에 포함되어 셀 안의 목록으로 다시 해석된다", () => {
    const el = render(" * A\n  * B\n  ||x\n * C ||\nd");
    const cell = el.querySelector("td")!;
    expect(cell.getAttribute("style")).toBe("text-align:left;");
    expect([...cell.children].map((c) => c.className)).toEqual([
      "wiki-paragraph",
      "wiki-list",
    ]);
    expect(cell.children[0].innerHTML).toBe("x");
    expect(cell.querySelector("li > .wiki-paragraph")!.innerHTML).toBe("C");

    const b = [...el.querySelectorAll("li")].find(
      (li) => li.firstElementChild?.textContent === "B",
    )!;
    expect(b.children[1].className).toBe("wiki-table-wrap");
    expect(el.innerHTML).not.toContain("C ||");
  });

  it("목록 기호가 있는 줄에서 표 행이 시작되면 항목에는 표만 들어간다", () => {
    const html = parse(" * ||x\ny ||\nd");
    expect(html).toContain('<li><div class="wiki-table-wrap">');
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );
  });

  it("목록 항목보다 깊게 들여쓴 표 행은 공백 수에 맞는 들여쓰기 안에 놓인다", () => {
    const html = parse(" * A\n   ||x\ny ||\nd");
    expect(html).toContain(
      '<div class="wiki-indent"><div class="wiki-indent"><div class="wiki-table-wrap">',
    );
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );
  });

  it("빈 줄은 표 행 안에서 두 번째 <br>로 남는다", () => {
    const html = parse(" * A\n ||x\n\ny ||\nd");
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br><br>y</div>',
    );
  });

  it("닫는 줄보다 제목이 먼저 나오면 표 행을 취소하고 시작 기호를 텍스트로 남긴다", () => {
    const html = parse(" * A\n ||x\n= WH =\ny ||\nd");
    expect(html).toContain('<li><div class="wiki-paragraph">A<br>||x</div>');
    expect(html).not.toContain("<table");
    expect(html).toContain('<span id="WH">WH</span>');
    expect(html).toContain('<div class="wiki-paragraph">y ||<br>d</div>');
  });

  it("끝까지 닫히지 않은 표 행은 뒤의 줄을 가져오지 않는다", () => {
    const src = " * A\n ||x\ny";
    expect(parse(src)).toContain(
      '<li><div class="wiki-paragraph">A<br>||x</div>',
    );
    const el = render(src);
    expect(el.querySelector("table")).toBe(null);
    const after = el.querySelector("ul")!.nextElementSibling!;
    expect(after.className).toBe("wiki-paragraph");
    expect(after.textContent).toBe("y");
  });

  it("들여쓰기 안의 표 행은 닫는 줄까지 이어진다", () => {
    const src = " ||x\ny ||\nd";
    expect(parse(src)).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );
    const el = render(src);
    const indent = el.querySelector(".wiki-indent")!;
    expect(indent.firstElementChild!.className).toBe("wiki-table-wrap");
    const after = indent.nextElementSibling!;
    expect(after.className).toBe("wiki-paragraph");
    expect(after.textContent).toBe("d");
  });

  it("인용문 안의 표 행은 닫는 줄까지 이어진다", () => {
    const html = parse("> ||x\ny ||\nd");
    expect(html).toContain(
      '<blockquote class="wiki-quote"><div class="wiki-indent"><div class="wiki-table-wrap">',
    );
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );
  });

  it("인용문 뒤의 > 줄을 그대로 포함하고 기호는 셀 안에서 해석한다", () => {
    const html = parse("> ||x\n> y ||\nd");
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x</div>' +
        '<blockquote class="wiki-quote"><div class="wiki-indent">' +
        '<div class="wiki-paragraph">y</div></div></blockquote></td>',
    );
  });

  it("문서 최상위의 표 행도 제목이 나오면 취소한다", () => {
    const html = parse("||x\n= XH =\ny ||\nd");
    expect(html).toContain('<div class="wiki-paragraph">||x</div>');
    expect(html).not.toContain("<table");
    expect(html).toContain('<span id="XH">XH</span>');
    expect(html).toContain('<div class="wiki-paragraph">y ||<br>d</div>');
  });

  it("표 행 안의 인용문 줄은 셀 안의 인용문이 된다", () => {
    const html = parse(" * A\n ||x\n> q\ny ||\nd");
    expect(html).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x</div>' +
        '<blockquote class="wiki-quote"><div class="wiki-indent">' +
        '<div class="wiki-paragraph">q</div></div></blockquote>' +
        '<div class="wiki-paragraph">y</div></td>',
    );
  });

  it("표 행이 닫힌 뒤 들여쓰기 없이 시작하는 표 행은 별도 표가 된다", () => {
    const src = " * A\n ||x\ny ||\n||a||\nd";
    expect(parse(src)).toContain(
      '<td style="text-align:left;"><div class="wiki-paragraph">x<br>y</div>',
    );

    const wrap = (render(src)).querySelector("ul")!.nextElementSibling!;
    expect(wrap.className).toBe("wiki-table-wrap");
    expect(wrap.querySelector("table")!.className).toBe("wiki-table");
    const row = wrap.querySelector("tr")!;
    expect(row.className).toBe("wiki-table-tr");
    expect(row.children[0].tagName).toBe("TD");
    expect(row.querySelector(".wiki-paragraph")!.innerHTML).toBe("a");
  });

  it("줄 끝에 공백이 있으면 해당 줄에서 표 행을 닫지 않는다", () => {
    const el = render(" * A\n ||x\ny || \nz ||\nd");
    const cells = [...el.querySelector("tr")!.children];
    expect(cells.map((c) => c.getAttribute("style"))).toEqual([
      "text-align:left;",
      "text-align:center;",
    ]);
    expect(cells[0].querySelector(".wiki-paragraph")!.innerHTML).toBe("x<br>y");
    expect(cells[1].querySelector(".wiki-paragraph")!.innerHTML).toBe("<br>z");
  });
});

describe("묶어서 처리하는 블록 안의 각주 번호", () => {
  it("목록 항목의 각주는 불필요한 항목 없이 1번부터 시작한다", () => {

    const html = parse(" * a[* fn]\n") as string;
    expect(html).toContain('href="#fn-1"');
    expect(html).not.toContain('href="#fn-2"');
    expect((html.match(/footnote-list/g) ?? []).length).toBe(1);
  });
  it("인용문·들여쓰기·표 셀 안의 각주 번호가 순서대로 이어진다", () => {
    const html = parse(">인용[* a]\n 들여쓰기[* b]\n||셀[* c]||\n");
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('href="#fn-2"');
    expect(html).toContain('href="#fn-3"');
    expect(html).not.toContain('href="#fn-4"');
  });
  it("중첩 목록 항목의 각주는 부모 항목의 각주 다음 번호를 받는다", () => {

    const html = parse(" 1. 바깥[* 먼저]\n  * 안쪽[* 나중]\n") as string;
    expect(html).toContain('title="먼저"');
    expect(html).toContain('title="나중"');
    expect(html.indexOf('href="#fn-1"')).toBeLessThan(
      html.indexOf('href="#fn-2"'),
    );
    expect(html).toContain('title="먼저" href="#fn-1"');
    expect(html).toContain('title="나중" href="#fn-2"');

    const deep = parse(" * a[* A]\n  * b[* B]\n   * c[* C]\n");
    expect(deep).toContain('title="A" href="#fn-1"');
    expect(deep).toContain('title="B" href="#fn-2"');
    expect(deep).toContain('title="C" href="#fn-3"');

    const after = parse(" * a[* A]\n  * b[* B]\n * c[* C]\n");
    expect(after).toContain('title="A" href="#fn-1"');
    expect(after).toContain('title="B" href="#fn-2"');
    expect(after).toContain('title="C" href="#fn-3"');
  });
});

describe("중괄호와 목록의 중첩 깊이", () => {
  it("중괄호는 이전 한도인 512단계를 넘어 끝까지 중첩된다", () => {
    const src =
      '{{{#!wiki style="color:red"\n'.repeat(515) +
      "MARK\n" +
      "}}}\n".repeat(515);
    const html = parse(src);

    expect(html).toContain(
      '<div style="color:red">'.repeat(515) + "MARK" + "</div>".repeat(515),
    );
    expect(html).not.toContain("}}}");
  });
  it("더 깊은 중괄호 앞의 텍스트 줄은 내부의 <br>를 유지한다", () => {
    const src =
      '{{{#!wiki style="color:red"\n'.repeat(512) +
      "A\n" +
      '{{{#!wiki style="color:red"\n' +
      "B\n" +
      "}}}\n".repeat(513);
    const html = parse(src);
    expect(html).toContain(
      '<div style="color:red">A<br><div style="color:red">B</div></div>',
    );
  });
  it("목록 항목은 이전 한도인 256단계를 넘어 끝까지 중첩된다", () => {
    let src = "";
    for (let i = 1; i <= 260; i++) src += " ".repeat(i) + "* L" + i + "\n";
    const el = render(src);
    const lists = [...el.querySelectorAll("ul")];
    expect(lists.length).toBe(260);
    expect(lists.every((u) => u.className === "wiki-list")).toBe(true);

    const l256 = lists[255].children[0];
    expect([...l256.children].map((c) => c.className)).toEqual([
      "wiki-paragraph",
      "wiki-list",
    ]);
    expect(l256.children[0].textContent).toBe("L256");
    expect(l256.children[1].children[0].children[0].textContent).toBe("L257");

    const l260 = lists[259].children[0];
    expect(l260.children.length).toBe(1);
    expect(l260.children[0].textContent).toBe("L260");
    expect(el.innerHTML).not.toContain("<li></li>");
    expect(el.innerHTML).not.toContain('<ul class="wiki-list"></ul>');
  });
});

describe("깊은 목록의 한 번 읽기 처리", () => {
  it("2000단계 목록을 단계마다 다시 읽지 않고 해석한다", () => {

    let src = "";
    for (let i = 1; i <= 2000; i++) src += " ".repeat(i) + "* L" + i + "\n";
    const html = parse(src) as string;
    expect(html).toContain("L2000");
    expect((html.match(/<ul /g) ?? []).length).toBeGreaterThan(255);
  });
});

describe("닫히지 않은 링크의 한 번 읽기 처리", () => {
  it("닫히지 않은 중첩 링크의 시작 부분은 텍스트로 남긴다", () => {
    const html = parse("[[a|[[b|[[c");
    expect(html).toContain("&#91;&#91;a|&#91;&#91;b|&#91;&#91;c");
  });
  it("[[a|가 40번 이어지고 닫는 기호가 하나여도 O(2^m)만큼 다시 읽지 않는다", () => {

    const html = parse("[[a|".repeat(40) + "]]");
    expect(html).toContain("&#91;&#91;a|".repeat(39));
    expect(html).toContain('href="/w/a"');
  });
  it("중괄호 안의 ]]는 링크를 닫지 않는다", () => {
    const html = parse("[[a|{{{x]]y}}}]]");
    expect(html).toContain('href="/w/a"');
    expect(html).toContain("x&#93;&#93;y");
  });
});

describe("중괄호 본문 끝의 줄바꿈은 구분자로 사용하고 내부에 <br>를 넣지 않는다", () => {
  it("#!wiki의 div 내용 끝에 <br>를 넣지 않는다", () => {
    expect(parse('{{{#!wiki style="color:red"\n내용\n}}}')).toContain(
      '<div style="color:red">내용</div>',
    );
  });
  it("#!folding의 내용 끝에 <br>를 넣지 않는다", () => {
    expect(parse("{{{#!folding 제목\n내용\n}}}")).toContain(
      "<summary> 제목</summary><div>내용</div>",
    );
  });
  it("#!if에서 표시하는 본문 끝에 <br>를 넣지 않는다", () => {
    expect(parse("{{{#!if 1\n내용\n}}}")).toContain(
      '<div class="wiki-paragraph">내용</div>',
    );
  });
});

describe("꾸밈 중괄호 본문의 블록은 줄바꿈을 자신의 뒤로 옮긴다", () => {
  it("표 앞의 줄바꿈은 제거하고 표 뒤에 줄바꿈을 넣는다", () => {

    const html = parse("{{{#!wiki\n앞\n||a||\n뒤\n}}}");
    expect(html).toContain("앞<div class=");
    expect(html).toContain("</table></div><br>뒤");
  });

  it("본문 맨 앞의 목록에도 뒤에 줄바꿈을 넣는다", () => {
    const html = parse("{{{#!wiki\n * a\n뒤\n}}}");
    expect(html).toContain("</ul><br>뒤");
  });

  it("본문에 블록만 있으면 줄바꿈을 넣지 않는다", () => {
    expect(parse("{{{#!wiki\n * a\n}}}")).not.toContain("</ul><br>");
  });

  it("수평선도 줄바꿈을 같은 방식으로 옮긴다", () => {

    expect(parse("{{{#!wiki\n앞\n----\n뒤\n}}}")).toContain(
      "앞<hr><br>뒤",
    );
  });

  it("들여쓰기 본문을 문단으로 감싸고 줄바꿈은 바깥에 둔다", () => {

    const html = parse("{{{#!wiki\n앞\n 들여쓰기\n뒤\n}}}");
    expect(html).toContain(
      '앞<div class="wiki-indent"><div class="wiki-paragraph">들여쓰기</div></div><br>뒤',
    );
  });

  it("문서 최상위의 들여쓰기도 본문을 문단으로 감싼다", () => {
    expect(parse(" 들여쓰기")).toContain(
      '<div class="wiki-indent"><div class="wiki-paragraph">들여쓰기</div>',
    );
  });
});
