import { describe, expect, it } from "vitest";
import { namuBgDark, namuFgDark } from "../src/helpers.ts";
import { parse } from "../src/namumark.ts";

describe("색상 — 이름의 16진수 변환과 나무위키 다크 모드 색상 생성", () => {
  it("색상 이름을 16진수로 바꾸고 이를 바탕으로 다크 모드 색상을 만든다", () => {
    expect(parse("||{{{#red 빨}}}||")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#FF7B7B;">빨</span>',
    );
  });

  it("16진수 색상은 유지하고 라이트 모드와 다크 모드 색상은 각각 정규화한다", () => {
    expect(parse("||{{{#ff0000 a}}}||")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#FF7B7B;">',
    );
    expect(parse("{{{#red,#blue b}}}")).toContain(
      '<span style="color:#ff0000" data-dark-style="color:#0000ff;">',
    );
  });

  it("밝은 색상과 transparent는 그대로 유지한다", () => {
    expect(parse("{{{#fff a}}}")).toContain(
      '<span style="color:#fff" data-dark-style="color:#fff;">',
    );
    expect(parse("{{{#ff85b1 a}}}")).toContain(
      '<span style="color:#ff85b1" data-dark-style="color:#ff85b1;">',
    );
    expect(parse("{{{#transparent a}}}")).toContain(
      '<span style="color:transparent" data-dark-style="color:transparent;">',
    );
  });

  it("라이트 모드와 다크 모드 모두 대문자 16진수를 소문자로 바꾼다", () => {
    expect(parse("{{{#FFFFFF a}}}")).toContain(
      '<span style="color:#ffffff" data-dark-style="color:#ffffff;">',
    );
    expect(parse("{{{#14F,#4AF a}}}")).toContain(
      '<span style="color:#14f" data-dark-style="color:#4af;">',
    );
    expect(parse("||{{{#C9151E a}}}||")).toContain(
      '<span style="color:#c9151e" data-dark-style="color:#F2878C;">',
    );
  });

  it("다크 모드 색상이 잘못되면 색상 지정 전체를 무효로 처리한다", () => {
    expect(parse("{{{#ff0000,#zzz 무효다크}}}")).toContain(
      "<code>#ff0000,#zzz 무효다크</code>",
    );

    expect(parse("{{{#ff0000 유효}}}")).toContain("<span style=");
  });

  it("알파값을 포함한 4자리와 8자리 16진수는 색상으로 인식하지 않는다", () => {
    expect(parse("{{{#ff00ff80 알파색}}}")).toContain(
      "<code>#ff00ff80 알파색</code>",
    );

    expect(parse("{{{#f00f 알파}}}")).toContain("<code>#f00f 알파</code>");
    expect(parse("{{{#f00 세자리}}}")).toContain("<span style=");
  });
});

describe("글자색 지정", () => {
  it("페이지 본문의 어두운 글자색은 목표 명도 0.55에 맞춘다", () => {
    expect(parse("{{{#000 t}}}")).toContain('color:#988F81;"');
    expect(
      parse('{{{#!wiki style="margin-top:1px"\n{{{#555 t}}}}}}'),
    ).toContain('color:#988F81;"');
    expect(parse("{{{#!folding [열기]\n{{{#000 t}}}}}}")).toContain(
      'color:#988F81;"',
    );
    expect(parse(" {{{#000 t}}}")).toContain('color:#988F81;"');
    expect(parse(" * {{{#000 t}}}")).toContain('color:#988F81;"');

    expect(parse("{{{#800000 t}}}")).toContain('color:#FF1A1A;"');
    expect(parse("{{{#000080 t}}}")).toContain('color:#1A6DFF;"');
    expect(parse("{{{#808000 t}}}")).toContain('color:#FFFF1A;"');

    expect(parse("{{{#005500 t}}}")).toContain('color:#988F81;"');
  });

  it("페이지 본문에서 색상을 그대로 유지하는 명도 경계는 0.45다", () => {
    expect(parse("{{{#707070 t}}}")).toContain('color:#988F81;"');
    expect(parse("{{{#757575 t}}}")).toContain('color:#757575;"');
    expect(parse("{{{#d00 t}}}")).toContain('color:#FF1A1A;"');
    expect(parse("{{{#e00 t}}}")).toContain('color:#e00;"');

    expect(parse("{{{#808080 t}}}")).toContain('color:#808080;"');
    expect(parse("> {{{#808080 t}}}")).toContain('color:#C3BEB6;"');
  });

  it("인용문과 배경 없는 표 안에서는 기본 배경 규칙을 따른다", () => {
    expect(parse("> {{{#000 t}}}")).toContain('color:#C3BEB6;"');
    expect(parse("> {{{#f00 t}}}")).toContain('color:#FF7B7B;"');
    expect(parse("> {{{#808080 t}}}")).toContain('color:#C3BEB6;"');
    expect(parse("> {{{#a6a6a6 t}}}")).toContain('color:#a6a6a6;"');
    expect(parse("||{{{#000 t}}}||")).toContain('color:#C3BEB6;"');

    const out = parse("> {{{#000 A}}}\n\n{{{#000 B}}}");
    expect(out).toContain('color:#C3BEB6;"');
    expect(out).toContain('color:#988F81;"');
  });

  it("#!wiki의 배경색은 글자색 변환의 기준 배경을 바꾸지 않는다", () => {
    expect(
      parse('{{{#!wiki style="background-color:#fc6"\n{{{#000 t}}}}}}'),
    ).toContain('color:#988F81;"');
    expect(
      parse('{{{#!wiki style="background-color:#fc6"\n{{{#f00 t}}}}}}'),
    ).toContain('color:#f00;"');
    expect(
      parse('{{{#!wiki style="background-color:#333"\n{{{#000 t}}}}}}'),
    ).toContain('color:#988F81;"');
    expect(
      parse('{{{#!wiki style="background-color:#333"\n{{{#f00 t}}}}}}'),
    ).toContain('color:#f00;"');
    expect(
      parse('{{{#!wiki style="background-color:#fff"\n{{{#000 t}}}}}}'),
    ).toContain('color:#988F81;"');
    expect(
      parse('{{{#!wiki style="background-color:#fff"\n{{{#f00 t}}}}}}'),
    ).toContain('color:#f00;"');
    expect(
      parse(
        '{{{#!wiki style="background-color:#fc6" dark-style="background-color:#555"\n{{{#000 t}}}}}}',
      ),
    ).toContain('color:#988F81;"');

    expect(
      parse(
        '||<bgcolor=#eaeaea>{{{#!wiki style="background-color:#fc6"\n{{{#000 t}}}}}}||',
      ),
    ).toContain('color:#BAB4AB;"');
  });
});

describe("다크 모드 색상 변환", () => {
  it("색상 채널 값이 같을 때도 32비트 부동소수점 색조와 보간 계산을 유지한다", () => {
    expect(namuFgDark("#004466", undefined, true)).toBe("#1AB3FF");
    expect(namuFgDark("#006496", undefined, true)).toBe("#1AB2FF");
    expect(namuFgDark("#0080c0", undefined, true)).toBe("#1AB3FF");
    expect(namuFgDark("#662277", undefined, true)).toBe("#B34DCC");
    expect(namuFgDark("#009944", undefined, true)).toBe("#1AFF7F");
    expect(namuFgDark("#047450", undefined, true)).toBe("#21F7B2");
    expect(namuFgDark("#b002ca", undefined, true)).toBe("#E01CFD");
  });

  it("관찰한 32비트 부동소수점 무채색 판정 경계를 따른다", () => {
    expect(namuFgDark("#640101", undefined, true)).toBe("#988F81");
    expect(namuFgDark("#650101", undefined, true)).toBe("#FD1C1C");
    expect(namuFgDark("#660101", undefined, true)).toBe("#FD1C1C");
    expect(namuFgDark("#5d3939", undefined, true)).toBe("#988F81");
    expect(namuFgDark("#7c4c4c", undefined, true)).toBe("#988F81");
  });

  it("배경 없는 표와 인용문의 목표 명도는 기본 배경에서 구한다", () => {
    expect(namuFgDark("#f733f3")).toBe("#FA80F7");
    expect(namuFgDark("#78272b")).toBe("#DE9B9E");
  });

  it("목표 명도를 계산하기 전에 배경색 채널을 정규화한다", () => {
    expect(namuFgDark("#005078", "rgb(24,26,27)")).toBe("#4CC4FF");
    expect(namuFgDark("#005078", "rgb(16,25,35)")).toBe("#4DC4FF");
  });

  it("배경보다 밝거나 어두운 글자색 모두 충분한 명도 차이를 유지한다", () => {
    expect(namuFgDark("#000", "#737373")).toBe("#000");
    expect(namuFgDark("#005078", "#737373")).toBe("#FFFFFF");
    expect(namuFgDark("#e5e5e5", "#737373")).toBe("#FFFFFF");
    expect(namuFgDark("#e6e6e6", "#737373")).toBe("#e6e6e6");
  });

  it("관찰한 경계에서 밝은 배경의 목표 색상을 바꾼다", () => {
    expect(namuFgDark("#8e8f8f", "#8e8f8f")).toBe("#FFFFFF");
    expect(namuFgDark("#8f8f8f", "#8f8f8f")).toBe("#1F1D19");
    expect(namuFgDark("#eeeeee", "#fff")).toBe("#988F81");
    expect(namuFgDark("#005078", "#fff")).toBe("#005078");
  });

  it("글자색의 색조와 채도는 유지하고 명도는 고정된 목표값에 맞춘다", () => {
    expect(namuFgDark("#ff0000")).toBe("#FF7B7B");
    expect(namuFgDark("#008000")).toBe("#7BFF7B");
    expect(namuFgDark("#ffa500")).toBe("#FFD07B");
    expect(namuFgDark("#c9151e")).toBe("#F2878C");
  });

  it("무채색 글자색은 기준 색상 #C3BEB6으로 바꾼다", () => {
    expect(namuFgDark("#808080")).toBe("#C3BEB6");
    expect(namuFgDark("#000000")).toBe("#C3BEB6");
  });

  it("어둡고 채도가 높은 글자색도 기준 색상으로 바꾼다", () => {
    expect(namuFgDark("#0e284c")).toBe("#C3BEB6");
  });

  it("파란 글자색의 색조를 205도 방향으로 옮긴다", () => {
    expect(namuFgDark("#0000ff")).toBe("#7BABFF");
    expect(namuFgDark("#3b5998")).toBe("#A0BCDA");
    expect(namuFgDark("#123456")).toBe("#91C1E8");
  });

  it("글자색의 명도가 0.64 이상이면 유지하고 바로 아래에서는 변환한다", () => {
    expect(namuFgDark("#6b57ec")).toBe("#9688F2");
    expect(namuFgDark("#6d5aed")).toBe("#6d5aed");
    expect(namuFgDark("#eaeaea")).toBe("#eaeaea");
  });

  it("밝은 배경은 어둡게 바꾸고 어두운 배경은 더 어둡게 바꾼다", () => {
    expect(namuBgDark("#ffffff")).toBe("#181A1B");
    expect(namuBgDark("#eaeaea")).toBe("#242728");
    expect(namuBgDark("#00a495")).toBe("#008377");
    expect(namuBgDark("#000000")).toBe("#000000");
    expect(namuBgDark("#ff0000")).toBe("#CC0000");
    expect(namuBgDark("#ffff00")).toBe("#999900");
  });

  it("해석할 수 없는 색상은 그대로 반환한다", () => {
    expect(namuFgDark("transparent")).toBe("transparent");
    expect(namuBgDark("rgb(0,164,149)")).toBe("rgb(0,164,149)");
  });
});

describe("사용 위치에 따른 색상 유효성 검사", () => {
  it("글자색은 grey 계열 이름과 peru를 대소문자 구분 없이 허용한다", () => {
    expect(parse("{{{#grey 회}}}")).toContain('style="color:#808080"');
    expect(parse("{{{#darkgrey 회}}}")).toContain('style="color:#a9a9a9"');
    expect(parse("{{{#dimgrey 회}}}")).toContain('style="color:#696969"');
    expect(parse("{{{#lightgrey 회}}}")).toContain('style="color:#d3d3d3"');
    expect(parse("{{{#lightslategrey 회}}}")).toContain('style="color:#778899"');
    expect(parse("{{{#slategrey 회}}}")).toContain('style="color:#708090"');
    expect(parse("{{{#darkslategrey 회}}}")).toContain('style="color:#2f4f4f"');
    expect(parse("{{{#peru 회}}}")).toContain('style="color:#cd853f"');
    expect(parse("{{{#GrEy,#PERU 짝}}}")).toContain(
      'style="color:#808080" data-dark-style="color:#cd853f;"',
    );
  });

  it("표의 글자색과 배경색은 grey 계열 이름과 peru를 허용한다", () => {
    expect(parse("||<bgcolor=gray>x||")).toContain(
      "background-color: rgb(128,128,128)",
    );
    expect(parse("||<bgcolor=grey>x||")).toContain(
      "background-color: rgb(128,128,128)",
    );
    expect(parse("||<color=grey>x||")).toContain("color: rgb(128,128,128)");
    expect(parse("||<bgcolor=darkgrey>x||")).toContain(
      "background-color: rgb(169,169,169)",
    );
    expect(parse("||<color=darkgrey>x||")).toContain("color: rgb(169,169,169)");
    expect(parse("||<bgcolor=dimgrey>x||")).toContain(
      "background-color: rgb(105,105,105)",
    );
    expect(parse("||<color=dimgrey>x||")).toContain("color: rgb(105,105,105)");
    expect(parse("||<bgcolor=lightgrey>x||")).toContain(
      "background-color: rgb(211,211,211)",
    );
    expect(parse("||<color=lightgrey>x||")).toContain("color: rgb(211,211,211)");
    expect(parse("||<bgcolor=lightslategrey>x||")).toContain(
      "background-color: rgb(119,136,153)",
    );
    expect(parse("||<color=lightslategrey>x||")).toContain("color: rgb(119,136,153)");
    expect(parse("||<bgcolor=slategrey>x||")).toContain(
      "background-color: rgb(112,128,144)",
    );
    expect(parse("||<color=slategrey>x||")).toContain("color: rgb(112,128,144)");
    expect(parse("||<bgcolor=darkslategrey>x||")).toContain(
      "background-color: rgb(47,79,79)",
    );
    expect(parse("||<color=darkslategrey>x||")).toContain("color: rgb(47,79,79)");
    expect(parse("||<bgcolor=peru>x||")).toContain(
      "background-color: rgb(205,133,63)",
    );
    expect(parse("||<color=peru>x||")).toContain("color: rgb(205,133,63)");
  });

  it("루비는 관찰한 소문자 색상 이름을 허용한다", () => {
    expect(parse("[ruby(BASE, ruby=gray, color=gray)]")).toContain(
      '<rt><span style="color:gray">gray</span></rt>',
    );
    expect(parse("[ruby(BASE, ruby=darkgray, color=darkgray)]")).toContain(
      '<rt><span style="color:darkgray">darkgray</span></rt>',
    );
    expect(parse("[ruby(BASE, ruby=peru, color=peru)]")).toContain(
      '<rt><span style="color:peru">peru</span></rt>',
    );
    expect(parse("[ruby(BASE, ruby=rebeccapurple, color=rebeccapurple)]")).toContain(
      '<rt><span style="color:rebeccapurple">rebeccapurple</span></rt>',
    );
  });

  it("루비는 grey 계열 별칭, 대문자가 섞인 색상 이름, transparent를 허용하지 않는다", () => {
    const grey = parse("[ruby(BASE, ruby=grey, color=grey)]");
    expect(grey).toContain("<rt>grey</rt>");
    expect(grey).not.toContain('<span style="color:grey">');

    const darkgrey = parse("[ruby(BASE, ruby=darkgrey, color=darkgrey)]");
    expect(darkgrey).toContain("<rt>darkgrey</rt>");
    expect(darkgrey).not.toContain('<span style="color:darkgrey">');

    const dimgrey = parse("[ruby(BASE, ruby=dimgrey, color=dimgrey)]");
    expect(dimgrey).toContain("<rt>dimgrey</rt>");
    expect(dimgrey).not.toContain('<span style="color:dimgrey">');

    const lightgrey = parse("[ruby(BASE, ruby=lightgrey, color=lightgrey)]");
    expect(lightgrey).toContain("<rt>lightgrey</rt>");
    expect(lightgrey).not.toContain('<span style="color:lightgrey">');

    const lightslategrey = parse(
      "[ruby(BASE, ruby=lightslategrey, color=lightslategrey)]",
    );
    expect(lightslategrey).toContain("<rt>lightslategrey</rt>");
    expect(lightslategrey).not.toContain('<span style="color:lightslategrey">');

    const slategrey = parse("[ruby(BASE, ruby=slategrey, color=slategrey)]");
    expect(slategrey).toContain("<rt>slategrey</rt>");
    expect(slategrey).not.toContain('<span style="color:slategrey">');

    const darkslategrey = parse(
      "[ruby(BASE, ruby=darkslategrey, color=darkslategrey)]",
    );
    expect(darkslategrey).toContain("<rt>darkslategrey</rt>");
    expect(darkslategrey).not.toContain('<span style="color:darkslategrey">');

    const uppercaseRed = parse("[ruby(BASE, ruby=RED, color=RED)]");
    expect(uppercaseRed).toContain("<rt>RED</rt>");
    expect(uppercaseRed).not.toContain('<span style="color:RED">');

    const capitalizedPeru = parse("[ruby(BASE, ruby=Peru, color=Peru)]");
    expect(capitalizedPeru).toContain("<rt>Peru</rt>");
    expect(capitalizedPeru).not.toContain('<span style="color:Peru">');

    const transparent = parse("[ruby(BASE, ruby=transparent, color=transparent)]");
    expect(transparent).toContain("<rt>transparent</rt>");
    expect(transparent).not.toContain('<span style="color:transparent">');
  });

  it("루비의 16진수 색상은 대소문자를 구분하지 않지만 4자리 알파값은 허용하지 않는다", () => {
    expect(parse("[ruby(BASE, ruby=lower, color=#fff)]")).toContain(
      '<rt><span style="color:#fff">lower</span></rt>',
    );
    expect(parse("[ruby(BASE, ruby=upper, color=#FFF)]")).toContain(
      '<rt><span style="color:#FFF">upper</span></rt>',
    );
    expect(parse("[ruby(BASE, ruby=alpha, color=#f00f)]")).toContain(
      "<rt>alpha</rt>",
    );
  });

  it("표 색상 옵션도 4자리 알파값을 허용하지 않는다", () => {
    const background = parse("||<bgcolor=#f00f>alpha||");
    expect(background).not.toContain("background-color");
    expect(background).toContain("&lt;bgcolor=#f00f&gt;alpha");

    const foreground = parse("||<color=#f00f>alpha||");
    expect(foreground).not.toContain('style="color');
    expect(foreground).toContain("&lt;color=#f00f&gt;alpha");
  });
});
