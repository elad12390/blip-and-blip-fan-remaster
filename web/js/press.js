// Browsers do not synthesize click for a second finger. HUD controls must
// remain usable while the first thumb holds the joystick.
export function onPress(button, action) {
  let pointer = null;
  const release = () => {
    const id = pointer; pointer = null;
    button.classList.remove('pressed');
    try { if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch {}
  };
  button.addEventListener('pointerdown', event => {
    if (button.disabled || pointer !== null || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    button.classList.add('pressed');
    try { button.setPointerCapture(pointer); } catch {}
  });
  button.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    const rect = button.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    release();
    if (inside && !button.disabled) action();
  });
  for (const name of ['pointercancel', 'lostpointercapture']) button.addEventListener(name, event => { if (event.pointerId === pointer) release(); });
  // Keyboard and assistive-technology activations have no pointer click count.
  button.addEventListener('click', event => { if (event.detail === 0 && !button.disabled) action(); });
}
