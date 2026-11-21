(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const readCookie = (name) => document.cookie.split('; ').find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  function render() {
    const modes = ['light', 'dark', 'system'];
    const shared = readCookie('modulon_poc_theme');
    const legacy = readCookie('modulon_theme');
    const mode = modes.includes(shared) ? shared : modes.includes(legacy) ? legacy : 'system';
    document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
  }
  render();
  media.addEventListener('change', render);
  window.addEventListener('pageshow', render);
  window.addEventListener('focus', render);
})();
