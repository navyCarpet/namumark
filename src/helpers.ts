import { validateHTMLColorHex, validateHTMLColorName } from 'validate-color';
import { other } from './rules.ts';

/**
 * Helpers
 */
const escapeReplacements: { [index: string]: string } = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const getEscapeReplacement = (ch: string) => escapeReplacements[ch];

export function escape(html: string, encode?: boolean) {
  if (encode) {
    if (other.escapeTest.test(html)) {
      return html.replace(other.escapeReplace, getEscapeReplacement);
    }
  } else {
    if (other.escapeTestNoEncode.test(html)) {
      return html.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
    }
  }

  return html;
}

export function unescape(html: string) {
  // explicitly match decimal, hex, and named HTML entities
  return html.replace(other.unescapeTest, (_, n) => {
    n = n.toLowerCase();
    if (n === 'colon') return ':';
    if (n.charAt(0) === '#') {
      return n.charAt(1) === 'x'
        ? String.fromCharCode(parseInt(n.substring(2), 16))
        : String.fromCharCode(+n.substring(1));
    }
    return '';
  });
}

export function cleanUrl(href: string) {
  try {
    href = encodeURI(href).replace(other.percentDecode, '%');
  } catch {
    return null;
  }
  return href;
}

export function splitCells(tableRow: string[], tableAttrs: {[key: string]: string}) {
  const realCells = [];
  let mergeCell = 0;
  for (let cell of tableRow) {
    if (cell === '') {
      mergeCell++;
      continue;
    }

    const style: {[key: string]: string} = {};
    const option: {[key: string]: string} = {};
    let cap;
    while (cell) {
      if (!tableAttrs['tablewidth'] && (cap = /^<table\s*width=(\d+(?:px|%|))>/.exec(cell))) {
        tableAttrs['tablewidth'] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['tablealign'] && (cap = /^<table\s*align=(left|center|right)>/.exec(cell))) {
        tableAttrs['tablealign'] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['tablecolor'] && (cap = /^<table\s*color=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['tablecolor'] = light;
        tableAttrs['tabledarkcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['tablebgcolor'] && (cap = /^<table\s*bgcolor=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['tablebgcolor'] = light;
        tableAttrs['tabledarkbgcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['colcolor'] && (cap = /^<col\s*color=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['colcolor'] = light;
        tableAttrs['coldarkcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['colbgcolor'] && (cap = /^<col\s*bgcolor=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['colbgcolor'] = light;
        tableAttrs['coldarkbgcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['rowcolor'] && (cap = /^<row\s*color=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['rowcolor'] = light;
        tableAttrs['rowdarkcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['rowbgcolor'] && (cap = /^<row\s*bgcolor=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['rowbgcolor'] = light;
        tableAttrs['rowdarkbgcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!tableAttrs['tablebordercolor'] && (cap = /^<table\s*bordercolor=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        tableAttrs['tablebordercolor'] = light;
        tableAttrs['tabledarkbordercolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['colspan'] && (cap = /^<-(\d+)>/.exec(cell))) {
        option['colspan'] = cap[1];
        cell = cell.substring(cap[0].length);
        mergeCell = 0;
        continue;
      }
      if (mergeCell) {
        option['colspan'] = String(mergeCell + 1);
        mergeCell = 0;
        continue;
      }
      if (!option['rowspan'] && (cap = /^<(\^|v)?\|(\d+)>/.exec(cell))) {
        if (cap[1] === '^') option['vertical-align'] = 'top';
        if (cap[1] === 'v') option['vertical-align'] = 'bottom';
        option['rowspan'] = cap[2];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['width'] && (cap = /^<width=(\d+(?:px|%|))>/.exec(cell))) {
        option['width'] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['height'] && (cap = /^<height=(\d+(?:px|%|))>/.exec(cell))) {
        option['height'] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['text-align'] && (cap = /^<(\(|:|\))>/.exec(cell))) {
        option['text-align'] = cap[1];
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['background-color'] && (cap = /^<bgcolor=(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        option['background-color'] = light;
        option['darkbgcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }
      if (!option['background-color'] && (cap = /^<(.+?)>/.exec(cell))) {
        const [light = '', dark = ''] = cap[1].split(',');
        if (light !== 'transparent' && !validateHTMLColorHex(light) && !validateHTMLColorName(light)) break;
        if (dark && dark !== 'transparent' && !validateHTMLColorHex(dark) && !validateHTMLColorName(dark)) break;
        option['background-color'] = light;
        option['darkbgcolor'] = dark;
        cell = cell.substring(cap[0].length);
        continue;
      }

      break;
    }

    realCells.push({ cell, option });
  }
  return realCells;
}

/**
 * Remove trailing 'c's. Equivalent to str.replace(/c*$/, '').
 * /c*$/ is vulnerable to REDOS.
 *
 * @param str
 * @param c
 * @param invert Remove suffix of non-c chars instead. Default falsey.
 */
export function rtrim(str: string, c: string, invert?: boolean) {
  const l = str.length;
  if (l === 0) {
    return '';
  }

  // Length of suffix matching the invert condition.
  let suffLen = 0;

  // Step left until we fail to match the invert condition.
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }

  return str.slice(0, l - suffLen);
}

export function findClosingBracket(str: string, opener: string, closer: string): number {
  // 1. 초기 확인: 닫는 괄호 문자열이 아예 없는 경우
  if (str.indexOf(closer) === -1) {
    return -1;
  }

  const openerLen = opener.length;
  const closerLen = closer.length;
  let level = 0;

  for (let i = 0; i < str.length; i++) {
    // 2. 이스케이프 문자(\) 처리
    if (str[i] === '\\') {
      i++; // 다음 문자를 건너뜁니다.
      continue; // 다음 반복으로 이동합니다.
    }

    // 3. 여는 괄호 문자열 처리
    // str의 현재 위치 i부터 openerLen 길이의 부분 문자열이 opener와 일치하는지 확인
    if (str.substring(i, i + openerLen) === opener) {
      level++;
      i += openerLen - 1; // 괄호 문자열의 길이만큼 인덱스를 건너뜁니다. (for문의 i++을 고려하여 -1)
    }

    // 4. 닫는 괄호 문자열 처리
    // str의 현재 위치 i부터 closerLen 길이의 부분 문자열이 closer와 일치하는지 확인
    else if (str.substring(i, i + closerLen) === closer) {
      level--;

      // 5. 불균형 확인: 대응되는 여는 괄호 없이 닫는 괄호가 나타난 경우
      if (level < 0) {
        return i; // 불균형을 초래한 닫는 괄호 문자열의 시작 인덱스 반환
      }

      i += closerLen - 1; // 괄호 문자열의 길이만큼 인덱스를 건너뜁니다. (for문의 i++을 고려하여 -1)
    }
  }

  // 6. 루프 종료 후 확인: 여는 괄호가 더 많은 경우
  if (level > 0) {
    return -2; // 괄호가 닫히지 않고 문자열이 끝남
  }

  // 7. 최종 반환: 균형이 잘 맞거나 다른 불균형이 발견되지 않은 경우
  return -1;
}
