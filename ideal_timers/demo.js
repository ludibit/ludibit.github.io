// Browser-only illustration: no network, storage, audio or notifications.
document.querySelectorAll('[data-demo]').forEach((board) => {
  const status = board.querySelector('[role="status"]');
  board.querySelectorAll('[data-seconds]').forEach((card) => {
    const initial = Number(card.dataset.seconds);
    const name = card.dataset.name;
    const output = card.querySelector('output');
    const toggle = card.querySelector('[data-action="toggle"]');
    let remaining = initial;
    let deadline = null;
    let interval = null;
    function secondsLeft() {
      return deadline === null ? remaining : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    }
    function stop() {
      remaining = secondsLeft();
      deadline = null;
      clearInterval(interval);
      interval = null;
    }
    function render() {
      const seconds = secondsLeft();
      output.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (deadline !== null && seconds === 0) {
        stop();
        status.textContent = `${name} finished. Ready for your next little thing?`;
      }
      const running = deadline !== null;
      card.dataset.running = String(running);
      toggle.textContent = running ? 'Pause' : 'Start';
      toggle.setAttribute('aria-label', `${running ? 'Pause' : 'Start'} ${name} timer`);
    }
    card.querySelector('.timer-controls').hidden = false;
    card.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.action;
      if (!action) return;
      if (action === 'toggle') {
        if (deadline !== null) {
          stop();
          status.textContent = `${name} paused.`;
        } else {
          if (remaining === 0) remaining = initial;
          deadline = Date.now() + remaining * 1000;
          interval = setInterval(render, 250);
          status.textContent = `${name} started. This demo stays in this page only.`;
        }
      } else if (action === 'add') {
        if (deadline === null) remaining = Math.min(remaining + 60, 599940);
        else deadline = Math.min(deadline + 60000, Date.now() + 599940000);
        status.textContent = `One minute added to ${name}.`;
      } else if (action === 'reset') {
        stop();
        remaining = initial;
        status.textContent = `${name} reset.`;
      }
      render();
    });
    render();
  });
});
