'use strict';

// var Chart = require('chart.js');

import Chart from 'chart.js'

// canvas要素を取得
var ctx = document.getElementById('myChart');

// jQueryを使う場合は
// var $ = requires('jquery');
// var ctx = $('#myChart');
// でもおｋ
// ※ npm install jquery --save しておくこと

// グラフのオプションを記載
var myChart = new Chart(ctx, {
  // グラフの形式を指定
  // 今回は棒グラフ形式
  type: "bar",
  // グラフのデータを指定
  data: {
    // X軸の見出し設定
    labels: ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'],
    // 各種グラフ設定
    datasets: [{
      // グラフの見出し設定
      label: '時間外労働時間',
      // Y軸のデータ設定
      data: [18, 11, 5, 16, 10, 9.5, 10],
      // グラフの背景色設定
      backgroundColor: [
        'rgba(255, 99, 132, 0.2)',
        'rgba(54, 162, 235, 0.2)',
        'rgba(255, 206, 86, 0.2)',
        'rgba(75, 192, 192, 0.2)',
        'rgba(153, 102, 255, 0.2)',
        'rgba(255, 159, 64, 0.2)'
      ],
      // グラフのボーダー設定
      borderColor: [
        'rgba(255,99,132,1)',
        'rgba(54, 162, 235, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 159, 64, 1)'
      ],
      // ボーダーの太さ設定
      borderWidth: 1
    }]
  },
  // グラフ自体の共通項目設置絵
  options: {
    // レスポンシブ形式を無効にする
    responsive: false
  }
});