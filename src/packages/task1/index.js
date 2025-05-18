function* incGenerator(start = 0) {
  let count = start;
  while (true) {
    yield count;
    count++;
  }
}

function* roundRobinGenerator(list) {
  let currentIndex = 0;
  while (true) {
    yield list[currentIndex];
    currentIndex = (currentIndex + 1) % list.length;
  }
}

function iteratorWithTimeout(
  iterator,
  timeoutSeconds,
  processingCallback,
  intervalMillisec = 1000,
) {
  let intervalTimerId = null;
  let overallTimeoutId = null;

  const stopProcessing = () => {
    if (intervalTimerId) {
      clearInterval(intervalTimerId);
      intervalTimerId = null;
    }
    if (overallTimeoutId) {
      clearInterval(overallTimeoutId);
      overallTimeoutId = null;
    }
  };

  intervalTimerId = setInterval(() => {
    const result = iterator.next();

    if (!result.done) {
      try {
        processingCallback(result.value);
      } catch (error) {
        console.error('Error during processCallback execution', error);
        stopProcessing();
      }
    } else {
      stopProcessing();
    }
  }, intervalMillisec);

  overallTimeoutId = setTimeout(() => {
    stopProcessing();
  }, timeoutSeconds * 1000);

  return stopProcessing;
}

module.exports = { incGenerator, roundRobinGenerator, iteratorWithTimeout };
