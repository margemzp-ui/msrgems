(function () {
  var header = document.querySelector('.site-header');
  var menu = document.querySelector('.menu-button');
  var journey = document.querySelector('.journey');
  var steps = Array.from(document.querySelectorAll('.journey-step'));
  var labels = ['Choose your source', 'Control the session', 'Keep the recording'];
  var count = document.getElementById('journeyCount');
  var label = document.getElementById('journeyLabel');

  function selectStep(index) {
    steps.forEach(function (step, stepIndex) {
      var active = stepIndex === index;
      step.classList.toggle('is-active', active);
      step.querySelector('button').setAttribute('aria-expanded', String(active));
    });
    journey.dataset.active = String(index + 1);
    count.textContent = (index + 1) + ' / ' + steps.length;
    label.textContent = labels[index];
  }

  steps.forEach(function (step, index) {
    step.querySelector('button').addEventListener('click', function () { selectStep(index); });
  });

  menu.addEventListener('click', function () {
    var open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  document.querySelectorAll('.site-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      header.classList.remove('menu-open');
      menu.setAttribute('aria-expanded', 'false');
    });
  });
})();
