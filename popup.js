document.getElementById('openStudio').addEventListener('click', function () {
  chrome.runtime.sendMessage({ type: 'open-studio' });
  window.close();
});
