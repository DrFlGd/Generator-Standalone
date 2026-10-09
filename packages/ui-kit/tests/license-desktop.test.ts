/* Regression: Tauri runs generator bundles without the separate DesktopHost
 * environment flag. Exports must not open either licence popup in Windows,
 * and neither the website nor the exported-file licences are changed. */
import './support/install-mini-dom';
import { setHostEnv } from '../src/host-env';
import { licenseAfterExport, openLicenseModal, licenseReminderToast } from '../src/components/license';

type HostGlobals = typeof globalThis & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
const host = globalThis as HostGlobals;
const initial = document.body.children.length;
const check = (name: string, ok: boolean) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) process.exitCode = 1;
};

setHostEnv('web'); // Tauri does not register a DesktopHost.
host.__TAURI__ = { dialog: {}, fs: {} };
licenseAfterExport();
openLicenseModal();
licenseReminderToast();
check('Tauri global suppresses both licence popups', document.body.children.length === initial);

delete host.__TAURI__;
host.__TAURI_INTERNALS__ = { invoke() {} };
licenseAfterExport();
openLicenseModal();
licenseReminderToast();
check('Tauri internals also suppress both popups', document.body.children.length === initial);
delete host.__TAURI_INTERNALS__;

setHostEnv('desktop');
licenseAfterExport();
openLicenseModal();
licenseReminderToast();
check('Existing embedding-host suppression remains', document.body.children.length === initial);
setHostEnv('web');

const modal = openLicenseModal();
check('Normal browser still shows its licence modal', !!document.querySelector('.vl-overlay'));
modal.close();
check('Normal browser modal still closes', !document.querySelector('.vl-overlay'));
