import { describe, it, expect } from 'vitest';
import { parse } from "..";

describe('syntax test', () => {
  it('strong', async () => {
    const result = await parse(`'''asdf'''`);

    const container = document.createElement('div');
    container.innerHTML = result;

    const strong = container.querySelector('strong');
    expect(strong).toBeDefined();
    expect(strong.textContent).toBe('asdf');
  });

  it('italic', async () => {
    const result = await parse(`''fdsa''`);

    const container = document.createElement('div');
    container.innerHTML = result;

    const em = container.querySelector('em');
    expect(em).toBeDefined();
    expect(em.textContent).toBe('fdsa');
  });

  it('link', async () => {
    const result = await parse(`[[asdf]]`);

    const container = document.createElement('div');
    container.innerHTML = result;

    const link = container.querySelector('a');
    expect(link).toBeDefined();
    // expect(link.getAttribute('href')).toBe('/w/asdf');
    expect(link.classList.contains('wiki-link')).toBe(true);
    expect(link.textContent).toBe('asdf');
  });
}); 