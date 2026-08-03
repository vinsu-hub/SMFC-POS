// Shared audio alerts for Kitchen Display (new order) and Order Queue
// (order ready for pickup). Files live in client/public/sounds so Vite
// serves them as static assets at these root-relative paths.
export const NEW_ORDER_SOUND = '/sounds/neworder.wav';
export const ORDER_READY_SOUND = '/sounds/orderreadyforpickup.wav';

export function playOrderSound(src: string) {
  try {
    const audio = new Audio(src);
    // Autoplay can be blocked before the user has interacted with the tab
    // at all -- that's fine, it's a convenience alert, not core flow, so
    // swallow the rejection instead of surfacing an error toast for it.
    void audio.play().catch(() => {});
  } catch {
    // Ignore -- unsupported environment (e.g. no Audio constructor in a test runner).
  }
}
