/* Desktop-only bridge, injected into all packaged hub and app HTML pages.
 * The original browser deployments are not modified. */
(() => {
  if (!window.__TAURI__) return;
  const api = window.__TAURI__;

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = new URL(link.href, location.href);

    // WebView2 download anchors (including programmatic a.click()) use a
    // Windows Save As dialog. Tauri's dialog scopes only the chosen file.
    if (link.hasAttribute('download')) {
      event.preventDefault();
      if (!api.dialog?.save || !api.fs?.writeFile) {
        window.alert('Desktop file-saving components are unavailable.');
        return;
      }
      void (async () => {
        try {
          const fileName = (link.getAttribute('download') || href.pathname.split('/').pop() || 'download.bin')
            .replace(/[\\/:*?"<>|]/g, '_');
          const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin';
          const destination = await api.dialog.save({
            defaultPath: fileName,
            filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
          });
          if (!destination) return;
          const response = await fetch(href.href);
          if (!response.ok) throw new Error('Export read failed: HTTP ' + response.status);
          await api.fs.writeFile(destination, new Uint8Array(await response.arrayBuffer()));
        } catch (error) {
          console.error('Desktop save failed:', error);
          window.alert('Could not save the file: ' + String(error));
        }
      })();
      return;
    }

    // Open off-site links in the default browser, without leaving the app.
    if ((href.protocol === 'http:' || href.protocol === 'https:') && href.origin !== location.origin) {
      event.preventDefault();
      if (api.opener?.openUrl) void api.opener.openUrl(href.href).catch(console.error);
      return;
    }

    // The hub links to directories (/make/, /Clicker-Generator/). Resolve to
    // the actual pre-rendered HTML file rather than relying on SPA fallback.
    if (href.origin === location.origin && href.pathname !== '/' && href.pathname.endsWith('/')) {
      event.preventDefault();
      location.assign(href.pathname + 'index.html' + href.search + href.hash);
    }
  }, true);
})();
