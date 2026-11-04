console.error(
  'PolyPath now requires its authentication server. A standalone HTML export cannot support login.\n' +
  'Use: npm run build && npm start\n' +
  'Then open http://127.0.0.1:3000 in your browser.'
);
process.exitCode = 1;
