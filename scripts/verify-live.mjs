const response = await fetch('https://mytotem.buzz/');
const html = await response.text();
console.log(JSON.stringify({
  status: response.status,
  title: html.includes('<title>TOTEM | Culture Engine on NEAR</title>'),
  favicon: html.includes('favicon.svg'),
  motion: html.includes('landing-motion.css'),
  removedCtas: !html.includes('Write your Community DNA') && !html.includes('See a live totem'),
  tokenRoute: html.includes('href="Token-First.dc.html"'),
  twinRoute: html.includes('href="Twin-Launch.dc.html"'),
  hasLongDash: /[—–]/.test(html),
}, null, 2));
