const {
  incGenerator,
  roundRobinGenerator,
  iteratorWithTimeout,
} = require('./index.js');

// Example 1: using incGenerator
console.log('Example 1: using incGenerator');
const firstExample = incGenerator(5);
console.log('First number:', firstExample.next().value);
console.log('Second number:', firstExample.next().value);
console.log('Third number:', firstExample.next().value);
console.log('\n');

// Example 2: using roundRobinGenerator
console.log('Example 2: using roundRobinGenerator');
const genres = ['Hip-hop', 'Pop', 'Rock'];
const secondExample = roundRobinGenerator(genres);
console.log('Genre 1:', secondExample.next().value);
console.log('Genre 2:', secondExample.next().value);
console.log('Genre 3:', secondExample.next().value);
console.log('Genre 4:', secondExample.next().value);
console.log('\n');

// Example 3: iteratorWithTimeout with incGenerator
console.log('Example 3: iteratorWithTimeout with incGenerator');
const countdownTicks = incGenerator(0);
const countdownDuration = 5;

function displayCountdown(tick) {
  const timeLeft = countdownDuration - (tick + 1);
  if (timeLeft >= 0) {
    console.log(`Countdown: ${timeLeft} seconds remaining`);
  }
  if (timeLeft === 0 && tick === countdownDuration - 1) {
    console.log('countdown finished');
  }
}
console.log('Starting 5-second countdown (1 tick per second)');
const stopCountdown = iteratorWithTimeout(
  countdownTicks,
  countdownDuration,
  displayCountdown,
  1000,
);

module.exports = { stopCountdown };
