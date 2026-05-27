(function () {
  var items = document.querySelectorAll(".reveal");
  if (!items.length || !("IntersectionObserver" in window)) {
    return;
  }

  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );

  items.forEach(function (el) {
    obs.observe(el);
  });
})();
