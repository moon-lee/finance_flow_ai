/* global financeShell, document, console */
async function mountPanelComponent(payload) {
  const { extensionId, viewId, mountData } = payload;
  const bundleUrl = `finance-shell://extensions/${extensionId}.js`;
  try {
    const bundle = await import(bundleUrl);
    if (typeof bundle.registerUIComponents === 'function') {
      bundle.registerUIComponents(financeShell);
    }
    const tagName = viewId;
    const el = document.createElement(tagName);
    if (mountData && typeof mountData === 'object') {
      el.setAttribute('data-mount', JSON.stringify(mountData));
    }
    const app = document.getElementById('app');
    if (app) {
      app.appendChild(el);
    } else {
      console.error(`[panel bootstrap] #app element not found in panel template`);
    }
  } catch (err) {
    console.error('[panel bootstrap] failed to mount component:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<p style="color:#ff6b6b;padding:1rem;">Panel failed to load. See console for details.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  financeShell.onPanelInit(async (payload) => {
    await mountPanelComponent(payload);
  });
});
