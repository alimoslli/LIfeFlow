const fs = require("fs");
const G = JSON.parse(fs.readFileSync(__dirname + "/glyphs.json", "utf8"));
const g = (k, cls = "") => G[k].replace("<svg", '<svg class="px ' + cls + '"');
// arc: 6AM..midnight over 180deg
const CX = 170,
  CY = 172,
  R = 138;
const ang = (h) => ((h - 6) / 18) * Math.PI;
const pt = (h, r = R) => [CX - r * Math.cos(ang(h)), CY - r * Math.sin(ang(h))];
const arc = (a, b, r, col, w, extra = "") => {
  const [p, q] = [pt(a, r), pt(b, r)];
  return `<path d="M${p[0].toFixed(1)} ${p[1].toFixed(1)}A${r} ${r} 0 ${(b - a) / 18 > 0.5 ? 1 : 0} 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
};
const dot = (h, col, r = 7, ring = "#fff") => {
  const [x, y] = pt(h);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}" stroke="${ring}" stroke-width="2.5"/>`;
};
function wheel(now, night) {
  const track = night ? "#2b3f6b" : "rgba(255,255,255,.55)";
  const [x, y] = pt(now, R);
  const who = night ? g("moon-n", "who") : g("ray", "who");
  return `<div class="wheel ${night ? "dk" : ""}"><div class="ww"><svg viewBox="0 0 340 196" class="wsvg">
   ${arc(6, 24, R, track, 12)}
   ${arc(9, 10.5, R, "#2f80ed", 12)}
   ${arc(17, 22, R, "#f59e0b", 12)}
   ${arc(19, 21, R - 17, "#ef4444", 5, 'stroke-dasharray="1 8"')}
   ${dot(9.75, "#2f80ed")}${dot(17, "#f59e0b")}${dot(23.98, "#ef4444", 6)}
   <text x="${pt(9.75, R + 0)[0] - 6}" y="${pt(9.75)[1] - 18}" class="wt" text-anchor="middle">Class</text>
   <text x="${pt(19.5)[0] - 2}" y="${pt(19.5)[1] - 22}" class="wt" text-anchor="middle">Shift</text>
   <text x="${pt(23.98)[0] - 2}" y="${pt(23.98)[1] - 14}" class="wt" text-anchor="end">Due</text>
   <text x="170" y="150" class="wt big" text-anchor="middle">${night ? "6:30 PM" : "2:00 PM"}</text>
   <text x="170" y="168" class="wt" text-anchor="middle" opacity=".75">${night ? "Sample time, ahead" : "Sample time, now"}</text>
   <rect x="14" y="172" width="312" height="3" fill="${night ? "#3a5da6" : "#fff"}" opacity=".7"/>
  </svg>
  <div class="who" style="left:${((x / 340) * 100).toFixed(2)}%;top:${((y / 196) * 100).toFixed(2)}%">${who}</div></div></div>`;
}
const scrub = (pct, label) =>
  `<div class="scrub"><span class="sl">6 AM</span><div class="trk"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div><span class="sl">12 AM</span></div><p class="hint">${label}</p>`;
const top = (back = true) => `<div class="bar"><a class="back">‹ Back to my place</a><span class="badge">Sample day</span></div>`;
const foot = `<div class="foot"><span class="pl">Your place in line</span><b>#12</b><a class="btn">Back to my place</a></div>`;
const rows = (open) => `<ol class="tl">
 <li><time>9:00 AM</time><i class="d" style="--c:#2f80ed"></i><div><b>Sample class</b><small>Till 10:30 AM</small></div></li>
 <li class="lk"><time>5:00 PM</time><i class="d" style="--c:#f59e0b"></i><div><b>Sample shift</b><small>Till 10:00 PM</small></div><em class="tag">Clash</em></li>
 <li class="lk sub"><time>7:00 PM</time><i class="d" style="--c:#7aa7f0"></i><div><b>Study block</b><small>Planned for the class</small></div></li>
 <li><time>11:59 PM</time><i class="d" style="--c:#ef4444"></i><div><b>Sample assignment due</b></div></li>
 <li class="tm"><time>Tomorrow</time><i class="d" style="--c:#0f8f80"></i><div><b>Sample bill due</b><small>The day after sample pay landed</small></div></li>
</ol>`;
const css = `
*{box-sizing:border-box;margin:0}body{background:#222;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#10203c}
.s{width:390px;height:844px;position:relative;overflow:hidden;margin-bottom:20px}
.px{image-rendering:pixelated;display:block}
.day{background:linear-gradient(#a9cbf2,#e6eef9 55%,#f2f6fb)}
.bar{display:flex;justify-content:space-between;align-items:center;padding:8px 16px 0}
.back{font-size:14px;font-weight:600;color:#1d4fb0;min-height:44px;display:flex;align-items:center}
.badge{background:#10203c;color:#ffd77a;font:700 11px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;padding:7px 11px;border-radius:99px}
h1{font:500 28px/1.05 Georgia,serif;letter-spacing:-.03em;padding:2px 20px 0}
.sub1{padding:4px 20px 8px;font-size:14px;color:#3b4f73}
.ww{position:relative}.wheel{position:relative;margin:0 16px;border-radius:26px;background:linear-gradient(#6fa8ea,#cfe2f6);padding:10px 4px 0;box-shadow:0 6px 20px rgba(30,60,120,.15)}
.wheel.dk{background:linear-gradient(#08122b,#14295a 80%,#1b3768);color:#fff}
.wsvg{display:block;width:100%}.wt{font:600 11px ui-sans-serif,system-ui,sans-serif;fill:#10203c}.dk .wt{fill:#e8efff}.wt.big{font-size:22px;font-weight:700}
.who{position:absolute;width:44px;height:44px;transform:translate(-50%,-70%)}.who svg{width:100%;height:100%}
.scrub{display:flex;align-items:center;gap:10px;padding:8px 22px 0;font-size:12px;color:#3b4f73}
.trk{flex:1;height:8px;border-radius:9px;background:rgba(16,32,60,.15);position:relative}.trk i{position:absolute;inset:0 auto 0 0;background:#f5a524;border-radius:9px}
.trk b{position:absolute;top:50%;width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid #f5a524;transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(0,0,0,.2)}
.hint{text-align:center;font-size:12px;color:#3b4f73;padding:4px 0 8px}
.find{margin:0 16px;background:#fff;border-radius:22px;padding:10px 16px 12px;box-shadow:0 4px 16px rgba(30,60,120,.12);border-left:5px solid #f59e0b}
.find p{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a86a00}
.find h2{font:600 16px/1.25 ui-sans-serif,system-ui,sans-serif;margin:2px 0 8px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:99px;background:#f5a524;color:#1b1200;font-weight:700;font-size:15px}
.tl{list-style:none;padding:8px 16px 0;margin:0 0 0}
.tl li{display:flex;align-items:center;gap:10px;min-height:38px;position:relative}
.tl time{width:64px;font-size:12px;color:#3b4f73;font-variant-numeric:tabular-nums}
.d{width:12px;height:12px;background:var(--c);flex:none;border-radius:2px;box-shadow:0 0 0 3px #fff}
.tl div{flex:1}.tl b{font-size:14.5px;display:block}.tl small{font-size:12px;color:#5a6c8c}
.tag{font:700 10px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;background:#fde8c2;color:#8a5200;padding:4px 8px;border-radius:99px;font-style:normal}
.tl li.lk::before{content:"";position:absolute;left:84px;top:50%;bottom:-50%;width:3px;background:#f59e0b;opacity:.9}
.tl li.lk.sub::before{bottom:50%;top:-50%}
.tl li.tm{margin-top:4px;border-top:1px dashed #9fb3d3;padding-top:4px}
.foot{position:absolute;left:0;right:0;bottom:0;height:72px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#10203c;color:#fff}
.foot .pl{font-size:12px;color:#c9d6ef;width:70px;line-height:1.2}.foot b{font:600 24px Georgia,serif;color:#ffd77a;width:50px}
.foot .btn{margin-left:auto;background:#ffd77a}
/* sheet */
.dim{position:absolute;inset:0;background:rgba(4,10,24,.55)}
.sheet{position:absolute;left:0;right:0;bottom:72px;background:#fff;border-radius:28px 28px 0 0;padding:10px 20px 20px;box-shadow:0 -10px 30px rgba(0,0,0,.25)}
.grab{width:44px;height:5px;border-radius:9px;background:#c5d0e4;margin:0 auto 14px}
.sheet .k{display:flex;gap:8px;align-items:center}.sheet .k i{width:14px;height:14px;background:#f59e0b;border-radius:3px}
.sheet h3{font:500 24px Georgia,serif;letter-spacing:-.02em}.sheet .when{font-size:14px;color:#3b4f73;margin:2px 0 12px}
.sheet .why{background:#fff6e5;border-radius:16px;padding:12px 14px;font-size:14.5px;line-height:1.4}
.src{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px;color:#3b4f73}.src span{white-space:nowrap;background:#10203c;color:#ffd77a;font:700 10px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;border-radius:99px}
.sheet .btn{margin-top:14px;width:100%;background:#e8eefb;color:#10203c}
/* night pages */
.night{background:#040a18;color:#fff}
.stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 20px 30px,#fff8,transparent),radial-gradient(1.5px 1.5px at 90px 80px,#fff6,transparent),radial-gradient(2px 2px at 160px 20px,#ffd77a99,transparent),radial-gradient(1.5px 1.5px at 260px 60px,#fff8,transparent),radial-gradient(1.5px 1.5px at 340px 110px,#fff6,transparent);background-size:360px 140px;opacity:.9}
.nb{display:flex;justify-content:space-between;align-items:center;padding:20px;position:relative}
.logo{font:600 20px Georgia,serif;display:flex;gap:8px;align-items:center}.logo i{width:30px;height:30px;border-radius:50%;background:linear-gradient(#6fa8ea 50%,#0b1a3a 50%);display:block}
.out{font-size:13px;padding:8px 14px;border-radius:99px;background:#ffffff1a;box-shadow:inset 0 0 0 1px #ffffff2a}
.kick{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#ffd77a;padding:0 20px;position:relative}
.n1{font:500 44px/.98 Georgia,serif;letter-spacing:-.045em;padding:10px 20px 0;position:relative}.n1 em{font-style:italic;color:#fbb24a}
.n2{padding:14px 20px 0;font-size:17px;line-height:1.5;color:#ffffffcc;position:relative}
.scene{margin:20px 20px 0;height:150px;border-radius:30px;position:relative;overflow:hidden;background:radial-gradient(circle at 88% 78%,#ffd77a47,transparent 38%),linear-gradient(#0b1a3a,#142a55 70%,#1b3768);box-shadow:inset 0 0 0 1px #ffffff1a}
.gate{position:absolute;right:16px;bottom:30px;width:62px;height:80px;border-radius:31px 31px 0 0;background:linear-gradient(#fff1c2,#fbb24a);box-shadow:0 0 0 4px #2a467a,0 0 30px 6px #ffd77a70}
.bridge{position:absolute;left:0;right:0;bottom:0;height:30px;background:linear-gradient(#0000 0 5px,#b2c4e8e6 5px 9px,#7890c4 9px)}
.walk{position:absolute;bottom:30px;display:flex;gap:2px;right:96px;flex-direction:row-reverse;align-items:flex-end}
.walk svg{width:34px;height:34px;opacity:.7}.walk svg.me{width:46px;height:46px;opacity:1}
.pin{position:absolute;top:-4px;left:50%;transform:translateX(-50%);background:#ffd77a;color:#040a18;font:700 9px sans-serif;letter-spacing:.1em;padding:2px 7px;border-radius:99px;text-transform:uppercase}
.cap{text-align:center;font-size:12px;color:#ffffff90;padding-top:8px;position:relative}
.glass{margin:14px 20px 0;border-radius:26px;padding:18px;background:#ffffff10;box-shadow:inset 0 0 0 1px #ffffff1f;position:relative}
.glass.go{background:linear-gradient(135deg,#ffd77a24,#ffffff10);box-shadow:inset 0 0 0 1px #ffd77a80}
.glass h2{font:500 24px/1.1 Georgia,serif;letter-spacing:-.03em}.glass p.kick{color:#ffd77a;margin:0}.glass p{font-size:14.5px;line-height:1.45;color:#ffffffc0;margin-top:6px}
.glass .btn{margin-top:12px;width:100%}.glass .ret{font-size:13px;color:#ffd77a;margin-top:10px;text-align:center}
.peek{margin:14px 20px 0;opacity:.55;font:500 22px Georgia,serif;position:relative}
.ex{padding:16px}.bub{position:relative;background:#fff;border-radius:24px 24px 24px 6px;padding:16px;box-shadow:0 6px 20px rgba(30,60,120,.15)}
.lab{display:inline-block;background:#10203c;color:#ffd77a;font:700 11px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;padding:6px 10px;border-radius:99px}
.bub p{font-size:17px;line-height:1.45;margin-top:10px}
.sk{display:flex;gap:10px;align-items:flex-end;margin:0 0 10px}.sk svg{width:64px;height:64px}.sk div{padding-bottom:6px;font-size:14px;color:#3b4f73}.sk b{display:block;color:#10203c;font-size:16px}
.note{margin:14px 4px 0;font-size:14px;color:#3b4f73;line-height:1.45}
.stack{margin:16px 0 0;background:#fff;border-radius:22px;padding:14px 16px;font-size:14px;line-height:1.5;color:#3b4f73}.stack b{color:#10203c}
`;
const nightFront = `<div class="peek">The front of the line</div>`;
const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div class="s night" id="s1"><div class="stars"></div>
 <div class="nb"><span class="logo"><i></i>LifeFlow</span><span class="out">Sign out</span></div>
 <p class="kick">You're on the list</p><h1 class="n1">You're <em>#12</em> in line.</h1>
 <p class="n2">240 people are waiting. We're letting people in a few at a time while we finish your sky.</p>
 <div class="scene"><div class="gate"></div><div class="bridge"></div><div class="walk">${g("dawn-n")}${g("star-n")}<div style="position:relative">${g("moon-n", "me")}<span class="pin">You</span></div>${g("goldie-n")}</div></div>
 <p class="cap">Moon is holding your spot.</p>
 <div class="glass go"><p class="kick" style="padding:0">While you wait</p><h2 style="margin-top:6px">See a sample day</h2><p>A made-up student day: a class, a shift, a deadline and a bill, all on one sky. Look around. Nothing is saved.</p><a class="btn" style="background:#ffd77a">See a sample day</a><p class="ret">You'll come straight back to your place, #12.</p></div>
 <div class="peek" style="margin-top:22px">The front of the line</div>
 <div class="peek" style="margin-top:4px;opacity:.3;font-size:18px">Bring a friend, move up a spot.</div>
</div>

<div class="s day" id="s2">${top()}
 <h1>Sample Tuesday</h1><p class="sub1">Made-up student day. Not real records.</p>
 ${wheel(14, false)}${scrub(44, "Slide the sun to see the day move")}
 <div class="find"><p>Spotted</p><h2>Your shift runs till 10 PM, over your 7 PM study block.</h2><a class="btn">See it at 6:30 PM</a></div>
 ${rows()}
 ${foot}</div>

<div class="s day" id="s3">${top()}
 <h1>Sample Tuesday</h1><p class="sub1">Made-up student day. Not real records.</p>
 ${wheel(18.5, true)}${scrub(69, "6:30 PM, sample time")}
 ${rows()}
 <div class="dim"></div>
 <div class="sheet"><div class="grab"></div><div class="k"><i></i><span class="lab">Shift</span></div>
  <h3 style="margin-top:8px">Sample shift</h3><p class="when">5:00 to 10:00 PM, Tuesday</p>
  <div class="why">It overlaps the study block at 7 PM. Your class is at 9 AM today, so a 2 PM study block would fit.</div>
  <div class="src"><span>Sample data</span>Made up for this preview. Not a real record.</div>
  <a class="btn">Close</a></div>
 ${foot}</div>

<div class="s day" id="s4">${top()}
 <div class="ex"><h1 style="padding:0 0 12px">A skyling's line</h1>
 <div class="sk">${g("ray")}<div><b>Ray</b>a sample skyling</div></div>
 <div class="bub"><span class="lab">Example</span><p>Your shift runs till 10, so study at 2 PM today. The bill tomorrow is covered: your pay landed this morning.</p></div>
 <p class="note">This line is written ahead of time to show what a skyling says. It isn't from a real skyling, and it isn't about you. Yours reads your own sky once you're in.</p>
 <div class="stack"><b>Nothing here is saved.</b> No chat, no connections, no real records. It's a look around.</div></div>
 <div class="foot" style="height:96px;flex-wrap:wrap;align-content:center;padding:0 16px"><span class="pl" style="width:auto;font-size:13px;flex:1">Your place in line</span><b style="width:auto;flex:none">#12</b><a class="btn" style="margin:8px 0 0;width:100%">Back to my place in line</a></div>
</div>`;
fs.writeFileSync(__dirname + "/preview.html", html);
