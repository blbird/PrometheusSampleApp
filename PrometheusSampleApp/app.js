const promClient = require('prom-client');
const http = require('http');
const express = require('express');

const PORT = 9100;

const app = express();

let cnt = 0;
let interval = 1;
const statusCodes = [200, 201, 400, 403, 404, 500];

const counter = new promClient.Counter({
  name: 'prom_sample_counter',
  help: 'prom_sample_counter_help',
});

const gauge = new promClient.Gauge({
  name: 'prom_sample_gauge',
  help: 'prom_sample_gauge_help',
});

const labeledGauge = new promClient.Gauge({
  name: 'prom_sample_labeled_gauge',
  help: 'prom_sample_labeled_gauge_help',
  labelNames: ['id'],
}); 

const histogram = new promClient.Histogram({
  name: 'prom_sample_histogram',
  help: 'prom_sample_histogram_help',
  labelNames: ['status_code'],
  buckets: [20, 40, 60, 80, 100],
});

const summary = new promClient.Summary({
  name: 'prom_sample_summary',
  help: 'prom_sample_summary_help',
  labelNames: ['status_code'],
});

gauge.set(0);

setInterval(() => {
  console.log('updated');
  // increase counter value
  counter.inc();

  // increase adn decrease gauge value
  if (interval === 1) {
    gauge.inc();
  }
  else {
    gauge.dec();
  }

  cnt += interval;
  if (cnt >= 10) {
    interval = -1;
  }
  else if (cnt <= 0) {
    interval = 1;
  }

  // set labeled gauage value
  labeledGauge.labels('2').set(cnt*2);
  labeledGauge.set({id: '3'}, cnt*3);

  // set histogram value
  const status = Math.floor(Math.random() * statusCodes.length);
  const duration = Math.floor(Math.random() * 100);

  histogram.labels(statusCodes[status]).observe(duration);
  summary.labels(statusCodes[status]).observe(duration);
}, 15000);

app.get('/metrics', (req, res) => {
  console.log('called metrics');
  res.set('Content-Type', promClient.register.contentType)
  res.end(promClient.register.metrics())
});

http.createServer(app).listen(PORT, () => {
  console.log('Your server is listening on http port ', PORT);
});
