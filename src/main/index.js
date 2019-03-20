fb.cb.onMessage.addHandler((type, timestamp, data) => {
  if (type === 'tip') {
    fb.logger.info(`${fb.runtime.broadcaster} was tipped ${data.amount} tokens!`);
  }
});
