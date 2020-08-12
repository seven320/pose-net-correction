/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as posenet from '@tensorflow-models/posenet';
import dat from 'dat.gui';
import Stats from 'stats.js';
import Chart from 'chart.js'

import {drawBoundingBox, drawKeypoints, drawSkeleton, isMobile, toggleLoadingUI, tryResNetButtonName, tryResNetButtonText, updateTryResNetButtonDatGuiCss} from './demo_util';
import { data } from '@tensorflow/tfjs';

const videoWidth = 400;
const videoHeight = 300;
const stats = new Stats();
const audio = new Audio('https://raw.githubusercontent.com/seven320/pose-net-correction/master/demos/sounds/Doorbell-Melody01-1.mp3')

/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const video = document.getElementById('video');
  video.width = videoWidth;
  video.height = videoHeight;

  const mobile = isMobile();
  const stream = await navigator.mediaDevices.getUserMedia({
    'audio': false,
    'video': {
      facingMode: 'user',
      width: mobile ? undefined : videoWidth,
      height: mobile ? undefined : videoHeight,
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();

  return video;
}

const defaultQuantBytes = 4;

const defaultMobileNetMultiplier = isMobile() ? 0.50 : 0.75;
const defaultMobileNetStride = 16;
const defaultMobileNetInputResolution = 200;

const guiState = {
  algorithm: 'single-pose',
  input: {
    architecture: 'MobileNetV1',
    outputStride: defaultMobileNetStride,
    inputResolution: defaultMobileNetInputResolution,
    multiplier: defaultMobileNetMultiplier,
    quantBytes: defaultQuantBytes
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5,
  },
  output: {
    showVideo: true,
    showSkeleton: true,
    showPoints: true,
    showBoundingBox: true,
  },
  pose: {
    maxPose: 80,
  },
  state: false,
  net: null,
};

/**
 * Sets up dat.gui controller on the top-right of the window
 */
function setupGui(cameras, net) {
  guiState.net = net;

  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const gui = new dat.GUI({width: 200});

  let architectureController = null;
  guiState[tryResNetButtonName] = function() {
    architectureController.setValue('MobileNetV1')
  };

  // gui.add(guiState, tryResNetButtonName).name(tryResNetButtonText);
  // updateTryResNetButtonDatGuiCss();

  // The input parameters have the most effect on accuracy and speed of the
  // network
  // let input = gui.addFolder('Input');
  // Architecture: there are a few PoseNet models varying in size and
  // accuracy. 1.01 is the largest, but will be the slowest. 0.50 is the
  // fastest, but least accurate.
  // architectureController =
  //     input.add(guiState.input, 'architecture', ['MobileNetV1']);
      // 現状の値を入れる
  // guiState.architecture = guiState.input.architecture; 
  // input.open();
  // Pose confidence: the overall confidence in the estimation of a person's
  // pose (i.e. a person detected in a frame)
  // Min part confidence: the confidence that a particular estimated keypoint
  // position is accurate (i.e. the elbow's position)

  let output = gui.addFolder('Output');
  output.add(guiState.output, 'showVideo');
  output.add(guiState.output, 'showSkeleton');
  output.add(guiState.output, 'showPoints');
  output.add(guiState.output, 'showBoundingBox');
}

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
  stats.showPanel(0);  // 0: fps, 1: ms, 2: mb, 3+: custom
  document.getElementById('main').appendChild(stats.dom);
}

/**
 * Feeds an image to posenet to estimate poses - this is where the magic
 * happens. This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video, net) {
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');

  let lengthEyeses = [];
  let triangleAreas = [];
  let averagelengthEyeses = [];
  let averageTriangleAreas = [];
  let chartCtx = document.getElementById('chart');
  let button = false;

  // since images are being fed from a webcam, we want to feed in the
  // original image and then just flip the keypoints' x coordinates. If instead
  // we flip the image, then correcting left-right keypoint pairs requires a
  // permutation on all the keypoints.
  const flipPoseHorizontal = true;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

// sets up buttons
  function setupButton() {
    document.getElementById('start').addEventListener('click', function(){
      guiState.pose.maxPose = averagelengthEyeses[averagelengthEyeses.length - 1] + 5;
      guiState.state = true;
    })
  }

  function drawChart() {
    let datasets = [{
        label: '目の距離(px)',
        data: averagelengthEyeses,
        backgroundColor: ['rgba(255, 99, 132, 0.2)'],
        borderColor: ['rgba(255,99,132,1)']
      },
      {
        label: 'maxPose',
        data: Array(averagelengthEyeses.length).fill(guiState.pose.maxPose),
      }
      // ,
      // {
      //   label: '面積',
      //   data: averageTriangleAreas
      // }
    ]
    if (!window.myChart) {
      let config = {
        type: "line",
        data: {
          labels: [...Array(averagelengthEyeses.length).keys()],
          datasets: datasets
        },
        // グラフ自体の共通項目設置絵
        options: {
          // レスポンシブ形式を無効にする
          responsive: false,
          maintainAspectRatio: false,
          scales: {
            xAxes: [{
              ticks: {
                suggestedMin: 10,
                stepSize: 5
              }
            }],
            yAxes: [{
              ticks: {
                suggestedMin: 0,
                suggestedMax: 150,
                stepSize: 10
              }
            }],
          },
          animation: {
            duration: 0
          }
        }
      }
      window.myChart = new Chart(chartCtx, config)
    }else{
      // データ更新

      window.myChart.data.datasets = datasets
      window.myChart.data.labels = [...Array(averagelengthEyeses.length).keys()]
      window.myChart.update();
    }
  };

  async function poseDetectionFrame() {
    // Begin monitoring code for frames per second
    stats.begin();

    let poses = []; 
    let minPoseConfidence;
    let minPartConfidence;
    switch (guiState.algorithm) {
      case 'single-pose':
        const pose = await guiState.net.estimatePoses(video, {
          flipHorizontal: flipPoseHorizontal,
          decodingMethod: 'single-person'
        });
        poses = poses.concat(pose);
        minPoseConfidence = +guiState.singlePoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.singlePoseDetection.minPartConfidence;
        break;
      case 'multi-pose':
        let all_poses = await guiState.net.estimatePoses(video, {
          flipHorizontal: flipPoseHorizontal,
          decodingMethod: 'multi-person',
          maxDetections: guiState.multiPoseDetection.maxPoseDetections,
          scoreThreshold: guiState.multiPoseDetection.minPartConfidence,
          nmsRadius: guiState.multiPoseDetection.nmsRadius
        });

        poses = poses.concat(all_poses);
        minPoseConfidence = +guiState.multiPoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.multiPoseDetection.minPartConfidence;
        break;
    }

    ctx.clearRect(0, 0, videoWidth, videoHeight);

    if (guiState.output.showVideo) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-videoWidth, 0);
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      ctx.restore();
    }

    // ここで目と目の距離を計算．
    let leftEyes = poses[0]['keypoints'][1]["position"];
    let rightEyes = poses[0]['keypoints'][2]["position"];
    let score = poses[0]['keypoints'][1]['score'] * poses[0]['keypoints'][2]['score']
    let nose = poses[0]['keypoints'][0]['position']

    let triangleArea = Math.abs(0.5 * ((leftEyes['x'] - nose['x']) * (rightEyes['y'] - nose['y']) - (rightEyes['x'] - nose['x']) -(leftEyes['y'] - nose['y'])));
    let lengthEyes = ((leftEyes['x'] - rightEyes['x']) ** 2 + (leftEyes['y'] - rightEyes['y']) ** 2) ** 0.5;

    if (lengthEyeses.length % 30 == 29) {
      let sum = 0;
      let areasum = 0; 
      for(var i = 0; i < lengthEyeses.length; i++){
        sum += lengthEyeses[i];
        areasum += triangleAreas[i];
      }
      averagelengthEyeses.push(Math.round(sum / lengthEyeses.length))
      averageTriangleAreas.push(Math.round(areasum / triangleAreas.length))
      lengthEyeses = []
      triangleAreas = []

      if(averagelengthEyeses.length > 50) {
        averagelengthEyeses = [];
      }


      if (!button){
        setupButton();
        button = true;
      }
      if (guiState.state){
        drawChart();
        if (averagelengthEyeses[averagelengthEyeses.length - 1] > guiState.pose.maxPose){
          audio.play();
        }
      }
    }

    // score が高い時のみ追加
    if (score > 0.5){
      lengthEyeses.push(lengthEyes);
      triangleAreas.push(triangleArea);
    }

    // For each pose (i.e. person) detected in an image, loop through the poses
    // and draw the resulting skeleton and keypoints if over certain confidence
    // scores
    poses.forEach(({score, keypoints}) => {
      if (score >= minPoseConfidence) {
        if (guiState.output.showPoints){
          drawKeypoints(keypoints, minPartConfidence, ctx);
        }
        if (guiState.output.showSkeleton){
          drawSkeleton(keypoints, minPartConfidence, ctx);
        }
        if (guiState.output.showBoundingBox){
          drawBoundingBox(keypoints, ctx);
        }
      }
    });
    // End monitoring code for frames per second
    stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

/**
 * Kicks off the demo by loading the posenet model, finding and loading
 * available camera devices, and setting off the detectPoseInRealTime function.
 */
export async function bindPage() {
  toggleLoadingUI(true);
  const net = await posenet.load({
    architecture: guiState.input.architecture,
    outputStride: guiState.input.outputStride,
    inputResolution: guiState.input.inputResolution,
    multiplier: guiState.input.multiplier,
    quantBytes: guiState.input.quantBytes
  });

  let video;

  try {
    video = await loadVideo();
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = 'this browser does not support video capture,' +
        'or this device does not have a camera';
    info.style.display = 'block';
    throw e;
  }
  toggleLoadingUI(false);

  setupGui([], net); // gui に必要な部分を全て統括
  setupFPS();
  detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
