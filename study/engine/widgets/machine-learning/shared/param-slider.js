/**
 * Labelled parameter slider with minus/plus buttons, shared by the machine-learning widgets.
 * 机器学习类组件共用的参数滑块，带标签与减/加按钮。
 *
 * Values snap to the step grid and the arrow keys use an explicit step, so the learner always sees
 * clean numbers (w0 = 19.00) instead of whatever the pointer position happened to give. Values set
 * from code (gradient descent, reset) are shown as they are.
 * 数值吸附到步长刻度，方向键使用明确的步长，学生看到的总是整齐的数字（如 w0 = 19.00），
 * 而不是指针位置随手给出的值；由程序设置的值（梯度下降、复位）则原样显示。
 */
import { h } from '../../../core/dom/element.js';
import { MINUS, clamp, decimalsOf, formatFixed, roundTo } from './ml-math.js';
import { mathText } from './ml-ui.js';

let sliderCount = 0;

const KEY_STEPS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };

export function paramSlider({ symbol, hint, min, max, step, keyStep = step, digits = decimalsOf(step), value, onChange }) {
  sliderCount += 1;
  const id = `ml-slider-${sliderCount}`;
  const stepDigits = decimalsOf(step);
  let current = value;

  const input = h('input', {
    id,
    class: 'ml-slider__range',
    type: 'range',
    min: String(min),
    max: String(max),
    step: 'any',
  });
  const valueText = h('span', { class: 'ml-slider__value', 'aria-hidden': 'true' });

  function show(next) {
    current = next;
    input.value = String(clamp(next, min, max));
    const text = formatFixed(next, digits);
    valueText.textContent = text;
    input.setAttribute('aria-valuetext', `${symbol} = ${text}`);
  }

  function commit(raw) {
    if (!Number.isFinite(raw)) return;
    const snapped = roundTo(clamp(Math.round(raw / step) * step, min, max), stepDigits);
    if (snapped === current) {
      show(current);
      return;
    }
    show(snapped);
    onChange?.(snapped);
  }

  input.addEventListener('input', () => commit(Number(input.value)));
  input.addEventListener('keydown', (event) => {
    if (Object.hasOwn(KEY_STEPS, event.key)) {
      event.preventDefault();
      commit(current + KEY_STEPS[event.key] * keyStep);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      commit(event.key === 'Home' ? min : max);
    }
  });

  const nudgeButton = (direction, text, zh, en) => h('button', {
    type: 'button',
    class: 'ml-slider__nudge',
    title: `${symbol} ${zh} ${en}`,
    'aria-label': `${symbol} ${zh} ${en}`,
    onclick: () => commit(current + direction * keyStep),
  }, h('span', { 'aria-hidden': 'true' }, text));

  const element = h('div', { class: 'ml-slider' },
    h('div', { class: 'ml-slider__head' },
      h('label', { class: 'ml-slider__label', for: id },
        mathText(symbol, 'ml-slider__symbol'),
        hint ? h('span', { class: 'ml-slider__hint' }, hint) : null),
      valueText),
    h('div', { class: 'ml-slider__track' },
      nudgeButton(-1, MINUS, '减小', 'Decrease'),
      input,
      nudgeButton(1, '+', '增大', 'Increase')));

  show(value);

  return {
    element,
    input,
    setValue: show,
    get value() {
      return current;
    },
  };
}
