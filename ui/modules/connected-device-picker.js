(function registerConnectedDevicePicker() {
  window.ChromationUI.register('connected-device-picker', (host, context) => {
    const select = host.querySelector('#mobile-connected-device');
    const refreshButton = host.querySelector('#mobile-refresh-devices');
    const hint = host.querySelector('#mobile-device-picker-hint');
    if (!select || !refreshButton || !hint) throw new Error('Connected device picker markup is incomplete');
    let devices = [];
    let disposed = false;

    const escape = context.escapeHTML || ((value) => String(value ?? ''));
    const choose = (serial, notify = true) => {
      const device = devices.find((item) => item.serial === serial && item.ready);
      if (!device) return undefined;
      select.value = device.serial;
      hint.textContent = `${device.label}. Device name and serial were filled automatically.`;
      if (notify) host.dispatchEvent(new CustomEvent('chromation-device-selected', { bubbles: true, detail: { device } }));
      return device;
    };

    const refresh = async ({ autoSelect = true } = {}) => {
      refreshButton.disabled = true;
      refreshButton.classList.add('loading');
      select.disabled = true;
      try {
        const result = await context.ipc.invoke('mobile-list-devices');
        if (disposed) return [];
        if (!result.success) throw new Error(result.error || 'Device discovery failed');
        devices = Array.isArray(result.devices) ? result.devices : [];
        const ready = devices.filter((device) => device.ready);
        select.innerHTML = '<option value="">Manual configuration</option>' + devices.map((device) => `<option value="${escape(device.serial)}" ${device.ready ? '' : 'disabled'}>${escape(device.label)}</option>`).join('');
        select.disabled = devices.length === 0;
        const currentSerial = context.getCurrentSerial?.() || '';
        if (devices.some((device) => device.serial === currentSerial && device.ready)) select.value = currentSerial;
        else if (autoSelect && ready.length === 1) choose(ready[0].serial);
        if (!select.value) hint.textContent = ready.length
          ? `${ready.length} ready device${ready.length === 1 ? '' : 's'} found. Select one to fill the connection details.`
          : devices.length ? 'Devices were found, but none are ready. Authorize USB debugging or reconnect the target.' : 'No devices found. Start an emulator or connect a USB device; manual configuration remains available.';
        return devices;
      } catch (error) {
        if (!disposed) { select.innerHTML = '<option value="">Device discovery unavailable</option>'; hint.textContent = error.message; }
        return [];
      } finally {
        if (!disposed) { refreshButton.disabled = false; refreshButton.classList.remove('loading'); }
      }
    };

    const onChange = () => choose(select.value);
    const onRefresh = () => { void refresh({ autoSelect: false }); };
    select.addEventListener('change', onChange);
    refreshButton.addEventListener('click', onRefresh);

    return {
      refresh,
      setValue(serial) { return choose(serial, false); },
      getDevices() { return devices.map((device) => ({ ...device })); },
      dispose() { disposed = true; select.removeEventListener('change', onChange); refreshButton.removeEventListener('click', onRefresh); },
    };
  });
})();
