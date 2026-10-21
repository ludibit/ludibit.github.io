// A self-contained preview of the visible app tile. No storage, network or permissions.
// Theme/waves: flavor_one_theme.dart and _WaterFillPainter. Adjustments: +/-60s.
(() => {
  const icons = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
    restart: '<path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z"/>',
    down: '<path d="m5 9 7 7 7-7z"/>',
    up: '<path d="m5 15 7-7 7 7z"/>',
    drag: [7, 12, 17].map(y => `<circle cx="9" cy="${y}" r="1.8"/><circle cx="15" cy="${y}" r="1.8"/>`).join(''),
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  const format = seconds => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const maxSeconds = 86399; // Matches drift_repository's maxTimerSeconds.

  document.querySelectorAll('[data-demo]').forEach((board, boardIndex) => {
    // Pages/browser caches can briefly serve the previous HTML with this script.
    // Upgrade that shell rather than failing before the controls are attached.
    if (!board.querySelector('.timer-list')) {
      board.querySelectorAll('.timer').forEach(card => card.remove());
      const title = board.querySelector('.demo-title');
      if (title) title.textContent = 'Your timer board';
      board.querySelector('.demo-top .caption')?.remove();
      const list = document.createElement('div');
      list.className = 'timer-list';
      board.querySelector('.demo-top').after(list);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'board-reset';
      reset.textContent = 'Reset demo';
      reset.hidden = true;
      board.querySelector('.demo-top').append(reset);
    }
    const list = board.querySelector('.timer-list');
    const status = board.querySelector('[role="status"]');
    const reset = board.querySelector('.board-reset');
    const specs = [
      { name: 'Focus', duration: 3600, remaining: 2311, counter: 0, running: true },
      { name: 'Break', duration: 300, remaining: 180, counter: 0, running: false },
    ];
    const models = [];
    let inView = true;
    let frame = null;
    let lastFrame = 0;
    let phase = 0;
    let holding = null;
    let dragging = null;
    const announce = message => { status.textContent = message; };

    specs.forEach((spec, index) => {
      const id = `liquid-${boardIndex}-${index}`;
      const card = document.createElement('div');
      card.className = 'timer';
      card.dataset.name = spec.name;
      card.innerHTML = `
        <div class="timer-heading"><div><strong>${spec.name}</strong><span class="timer-end"></span></div><span class="timer-counter" aria-label="Completion count"></span></div>
        <div class="timer-track">
          <div class="liquid-fill" aria-hidden="true"><svg viewBox="0 0 1000 68" preserveAspectRatio="none">
            <defs><linearGradient id="${id}-shimmer" x2="1" y2="1"><stop stop-color="white" stop-opacity=".26"/><stop offset="1" stop-color="white" stop-opacity=".03"/></linearGradient></defs>
            <path class="wave-shimmer" fill="url(#${id}-shimmer)"/><path class="wave-ripple" fill="#7ae7ff" opacity=".22"/>
            <g class="bubbles" fill="white" opacity=".24"><circle r="3"/><circle r="2.5"/><circle r="4"/><circle r="2"/></g>
          </svg></div>
          <div class="timer-controls">
            <button type="button" class="drag-handle" title="Drag to reorder; use arrow keys when focused" aria-label="Move ${spec.name}; use up and down arrow keys">${icon('drag')}</button>
            <div class="timer-adjust"><button type="button" data-action="decrease" title="Decrease by one minute; hold to repeat" aria-label="Decrease ${spec.name} by one minute">${icon('down')}</button><output role="timer" aria-live="off" aria-label="${spec.name} time remaining"></output><button type="button" data-action="increase" title="Increase by one minute; hold to repeat" aria-label="Increase ${spec.name} by one minute">${icon('up')}</button></div>
            <button type="button" data-action="toggle"></button>
          </div>
        </div>`;
      list.append(card);
      const model = { spec, card, remaining: spec.remaining, counter: spec.counter, deadline: spec.running ? Date.now() + spec.remaining * 1000 : null, visualMax: spec.duration };
      model.output = card.querySelector('output');
      model.end = card.querySelector('.timer-end');
      model.count = card.querySelector('.timer-counter');
      model.fill = card.querySelector('.liquid-fill');
      model.toggle = card.querySelector('[data-action="toggle"]');
      model.shimmer = card.querySelector('.wave-shimmer');
      model.ripple = card.querySelector('.wave-ripple');
      model.bubbles = [...card.querySelectorAll('.bubbles circle')];
      models.push(model);

      const handle = card.querySelector('.drag-handle');
      handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'ArrowUp' ? card.previousElementSibling : card.nextElementSibling;
        if (target) move(card, target, event.key === 'ArrowDown');
        handle.focus();
      });
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        dragging = { card, handle, id: event.pointerId, startY: event.clientY };
        handle.setPointerCapture(event.pointerId);
        card.classList.add('is-dragging');
      });
      handle.addEventListener('pointerup', event => {
        if (!dragging || dragging.id !== event.pointerId) return;
        if (Math.abs(event.clientY - dragging.startY) > 8) {
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.timer');
          if (target && target !== card && target.parentElement === list) {
            const rect = target.getBoundingClientRect();
            move(card, target, event.clientY > rect.top + rect.height / 2);
          }
        }
        endDrag();
      });
      handle.addEventListener('pointercancel', endDrag);
      handle.addEventListener('lostpointercapture', endDrag);

      card.querySelectorAll('[data-action]').forEach(button => {
        let repeated = false;
        button.addEventListener('click', () => {
          if (repeated) { repeated = false; return; }
          act(model, button.dataset.action);
        });
        if (button.dataset.action === 'toggle') return;
        button.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;
          stopHold();
          repeated = false;
          button.setPointerCapture(event.pointerId);
          let count = 0;
          const repeat = () => {
            repeated = true;
            act(model, button.dataset.action);
            count++;
            holding = setTimeout(repeat, count < 3 ? 320 : count < 8 ? 190 : count < 18 ? 105 : 65);
          };
          holding = setTimeout(repeat, 500);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(type => button.addEventListener(type, stopHold));
      });
    });
    // Remove the static fallback only once the complete board has been built.
    list.querySelector('p')?.remove();
    reset.hidden = false;

    function endDrag() {
      dragging?.card.classList.remove('is-dragging');
      dragging = null;
    }
    function move(card, target, after) {
      list.insertBefore(card, after ? target.nextSibling : target);
      announce(`${card.dataset.name} moved to position ${[...list.children].indexOf(card) + 1}.`);
    }
    function stopHold() { clearTimeout(holding); holding = null; }
    function remaining(model) {
      return model.deadline === null ? model.remaining : Math.max(0, Math.ceil((model.deadline - Date.now()) / 1000));
    }
    function complete(model) {
      model.remaining = 0;
      model.deadline = null;
      model.counter++;
      announce(`${model.spec.name} finished. Completion count ${model.counter}. Use restart to reset the timer.`);
    }
    function settle(model) {
      if (model.deadline !== null && remaining(model) === 0) complete(model);
    }
    function act(model, action) {
      settle(model);
      const seconds = remaining(model);
      if (action === 'toggle') {
        if (model.deadline !== null) {
          model.remaining = seconds;
          model.deadline = null;
          announce(`${model.spec.name} paused.`);
        } else if (seconds === 0) {
          // As in the app, restart restores the duration and leaves the timer paused.
          model.remaining = model.spec.duration;
          model.visualMax = model.spec.duration;
          announce(`${model.spec.name} restarted. Press play to begin.`);
        } else {
          model.deadline = Date.now() + seconds * 1000;
          announce(`${model.spec.name} started.`);
        }
      } else {
        const next = Math.max(0, Math.min(maxSeconds, seconds + (action === 'increase' ? 60 : -60)));
        if (next === 0 && seconds > 0) complete(model);
        else if (model.deadline !== null) model.deadline = Date.now() + next * 1000;
        else model.remaining = next;
        model.visualMax = next === model.spec.duration ? model.spec.duration : Math.max(model.visualMax, next);
        if (next > 0 || seconds === 0) announce(`${model.spec.name}: ${format(next)} remaining.`);
      }
      render(model);
    }
    function render(model) {
      settle(model);
      const seconds = remaining(model);
      const running = model.deadline !== null;
      model.card.dataset.running = String(running);
      model.card.dataset.remaining = seconds;
      model.card.dataset.counter = model.counter;
      model.output.textContent = format(seconds);
      model.count.textContent = model.counter;
      model.count.setAttribute('aria-label', `${model.counter} completions`);
      model.end.textContent = running ? `End time: ${new Date(model.deadline).toLocaleTimeString()}` : '';
      const state = running ? 'pause' : seconds === 0 ? 'restart' : 'play';
      if (model.toggle.dataset.icon !== state) {
        model.toggle.innerHTML = icon(state);
        model.toggle.dataset.icon = state;
        const label = `${state[0].toUpperCase() + state.slice(1)} ${model.spec.name} timer`;
        model.toggle.setAttribute('aria-label', label);
        model.toggle.title = label;
      }
      const progress = Math.min(1, seconds / model.visualMax);
      model.fill.style.width = `${progress * 100}%`;
      model.card.style.setProperty('--handle-color', progress * model.card.clientWidth > 38 ? '#001f29cc' : '#e2f7ffcc');
    }
    function wave(base, amplitude, frequency, shift) {
      let d = `M0 68 L0 ${base}`;
      for (let x = 0; x <= 1000; x += 8) d += ` L${x} ${base + Math.sin(x / 1000 * frequency * Math.PI * 2 + shift) * amplitude}`;
      return d + ' L1000 68 Z';
    }
    function paint(model) {
      const p = reducedMotion.matches ? 0 : phase;
      model.shimmer.setAttribute('d', wave(68 * .28, 68 * .10, 1.4, p * Math.PI * 2));
      model.ripple.setAttribute('d', wave(68 * .62, 68 * .08, 2, -p * Math.PI * 4));
      const specs = [[.16,.05,.20,.03,1,0],[.42,.04,.42,.04,2,Math.PI/3],[.66,.06,.61,.03,1,Math.PI/2],[.84,.03,.76,.02,2,Math.PI]];
      model.bubbles.forEach((bubble, i) => {
        const [cx, ax, cy, ay, cycles, offset] = specs[i];
        const theta = p * Math.PI * 2 * cycles + offset;
        bubble.setAttribute('cx', 1000 * (cx + Math.sin(theta) * ax));
        bubble.setAttribute('cy', 68 * (cy + Math.cos(theta) * ay));
      });
    }
    function animate(now) {
      frame = null;
      if (!inView || document.hidden || reducedMotion.matches) return;
      if (now - lastFrame >= 33) {
        phase += Math.min(now - lastFrame, 100) / 2200;
        lastFrame = now;
        models.forEach(paint);
      }
      frame = requestAnimationFrame(animate);
    }
    function syncAnimation() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      models.forEach(model => { render(model); paint(model); });
      if (inView && !document.hidden && !reducedMotion.matches) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(animate);
      }
    }
    reset.addEventListener('click', () => {
      stopHold(); endDrag();
      models.forEach(model => {
        model.remaining = model.spec.remaining;
        model.counter = model.spec.counter;
        model.deadline = model.spec.running ? Date.now() + model.spec.remaining * 1000 : null;
        model.visualMax = model.spec.duration;
        list.append(model.card);
        render(model);
      });
      announce('Demo restored to its original timers, counters and order. Focus is running.');
    });
    window.addEventListener('blur', stopHold);
    document.addEventListener('visibilitychange', () => { stopHold(); endDrag(); syncAnimation(); });
    reducedMotion.addEventListener('change', syncAnimation);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncAnimation(); }).observe(board);
    }
    setInterval(() => { if (!document.hidden && inView) models.forEach(render); }, 250);
    syncAnimation();
  });
})();
