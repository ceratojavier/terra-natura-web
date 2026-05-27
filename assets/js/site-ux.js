(function () {
  var items = document.querySelectorAll(".reveal");
  if (items.length && "IntersectionObserver" in window) {
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
  }

  var slides = document.querySelectorAll(".hero-slide");
  var idx = 0;
  if (slides.length > 1) {
    setInterval(function () {
      slides[idx].classList.remove("is-active");
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add("is-active");
    }, 5200);
  }

  var glow = document.querySelector(".hero-glow");
  if (glow) {
    window.addEventListener("mousemove", function (ev) {
      var x = (ev.clientX / window.innerWidth - 0.5) * 20;
      var y = (ev.clientY / window.innerHeight - 0.5) * 20;
      glow.style.transform = "translate(" + x + "px," + y + "px)";
    });
  }
})();
