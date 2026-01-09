import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene'; // 作ったMainSceneを読み込む

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'app',
  backgroundColor: '#2d2d2d',
  scene: [MainScene], // ここでMainSceneを指定！
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

new Phaser.Game(config);