const state = { energy: 'medium', minutes: 30, started: false };

// 这是固定、可解释的筛选演示；不调用 Agent 或 AI。
const recommendations = {
  low: {
    15: ['为登录流程补一段错误文案', '只写清楚「发生了什么」和「下一步能做什么」，不需要完成整页。', '15 分钟 · 低精力'],
    30: ['整理桌面上的三份访谈笔记', '只给文件加上清楚的名字，并把它们放到同一个文件夹。', '30 分钟 · 低精力'],
    60: ['把未整理的想法放进收件箱', '逐条浏览并归类；只捕捉，不判断、不开始处理。', '1 小时 + · 低精力']
  },
  medium: {
    15: ['给当前主线写一句完成定义', '只回答：做到什么程度，就算这一阶段已经足够？', '15 分钟 · 中等精力'],
    30: ['整理用户访谈的三条共识', '打开访谈笔记，只提炼反复出现的三句话；不需要写成完整报告。', '30 分钟 · 中等精力'],
    60: ['完成今天页面的空状态草图', '从用户没有主线的首次进入开始，画出一个能继续行动的界面。', '1 小时 + · 中等精力']
  },
  high: {
    15: ['为 MVP 写出今天最关键的问题', '用一句可验证的话描述它，暂时不要扩展解决方案。', '15 分钟 · 充沛精力'],
    30: ['整理用户访谈的三条共识', '打开访谈笔记，只提炼反复出现的三句话；不需要写成完整报告。', '30 分钟 · 充沛精力'],
    60: ['梳理当前主线的第一个完整切片', '把主线拆成能从打开页面走到完成的最小路径。', '1 小时 + · 充沛精力']
  }
};

const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function updateRecommendation() {
  const [title, copy, reason] = recommendations[state.energy][state.minutes];
  setText('#recommendation-title', title);
  setText('#recommended-copy', copy);
  setText('#matching-note', reason);
  state.started = false;
  document.querySelector('#begin-action').innerHTML = '开始这件事 <span aria-hidden="true">→</span>';
}

function updateRoute() {
  const route = window.location.hash === '#today' ? 'today' : 'home';
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== route;
  });
  document.querySelectorAll('[data-route-link]').forEach((link) => {
    const active = link.dataset.routeLink === route;
    link.classList.toggle('active', active);
    link.toggleAttribute('aria-current', active);
  });
  document.title = route === 'today' ? 'LifeKernel OS · 今天' : 'LifeKernel OS';
}

document.querySelector('#energy-control').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-energy]');
  if (!button) return;
  state.energy = button.dataset.energy;
  document.querySelectorAll('[data-energy]').forEach((item) => item.classList.toggle('selected', item === button));
  updateRecommendation();
});

document.querySelector('#time-control').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-minutes]');
  if (!button) return;
  state.minutes = Number(button.dataset.minutes);
  document.querySelectorAll('[data-minutes]').forEach((item) => item.classList.toggle('selected', item === button));
  updateRecommendation();
});

document.querySelector('#begin-action').addEventListener('click', () => {
  const title = document.querySelector('#recommendation-title').textContent;
  state.started = true;
  document.querySelector('#begin-action').textContent = '正在做这件事';
  showToast(`现在只做「${title}」就好。`);
});

document.querySelector('#action-list').addEventListener('click', (event) => {
  const row = event.target.closest('.action-row');
  if (!row) return;

  if (event.target.closest('.row-action')) {
    setText('#recommendation-title', row.dataset.title);
    setText('#recommended-copy', '已换成这件行动。只要开始，不需要把其他事情也一起处理。');
    setText('#matching-note', `${row.dataset.time} · ${row.dataset.energy}`);
    state.started = false;
    document.querySelector('#begin-action').innerHTML = '开始这件事 <span aria-hidden="true">→</span>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`已选「${row.dataset.title}」。`);
    return;
  }

  const check = event.target.closest('.check-button');
  if (!check || check.classList.contains('is-completed')) return;
  check.classList.add('is-completed');
  row.classList.add('done');
  showToast(`完成了「${row.dataset.title}」。很好。`);
});

document.querySelector('#show-how').addEventListener('click', () => {
  document.querySelector('#how').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

window.addEventListener('hashchange', updateRoute);
if (!window.location.hash) window.history.replaceState(null, '', '#home');
updateRoute();
