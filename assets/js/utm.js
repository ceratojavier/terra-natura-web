/**
 * Guarda UTMs en sessionStorage para acordarte en WhatsApp mensaje opcional (AMA/analytics después).
 */
(function () {
  const q = new URLSearchParams(location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  let out = {};
  keys.forEach((k) => {
    const v = q.get(k);
    if (v) out[k] = v;
  });
  if (Object.keys(out).length) {
    sessionStorage.setItem("tn_utm", JSON.stringify(out));
  }
})();
