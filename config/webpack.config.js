const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  target: 'node',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, '../dist'),
    libraryTarget: 'commonjs2',
  },
  externals: {
    'puppeteer-core': 'commonjs puppeteer-core',
    'chrome-remote-interface': 'commonjs chrome-remote-interface',
    'playwright-core': 'commonjs playwright-core',
  },
};
