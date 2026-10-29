// Acknowledge each tick so a busy main thread never accumulates worker messages.
let pending = false;
setInterval(() => {
  if (!pending) {
    pending = true;
    self.postMessage('tick');
  }
}, 1000 / 30);
self.onmessage = () => { pending = false; };
