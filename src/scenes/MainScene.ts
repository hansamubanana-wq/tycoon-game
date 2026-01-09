import Phaser from 'phaser';

type ShopItem = {
  id: string;
  name: string;
  basePrice: number;
  price: number;
  earnRate: number;
  count: number;
  uiNameText?: Phaser.GameObjects.Text;
  uiPriceText?: Phaser.GameObjects.Text;
  uiButton?: Phaser.GameObjects.Shape;
};

type GameSaveData = {
  money: number;
  items: { id: string; count: number; price: number }[];
};

export class MainScene extends Phaser.Scene {
  private money: number = 0;
  
  private items: ShopItem[] = [
    { id: 'cart', name: '屋台', basePrice: 500, price: 500, earnRate: 10, count: 0 },
    { id: 'cafe', name: 'カフェ', basePrice: 3000, price: 3000, earnRate: 50, count: 0 },
    { id: 'it', name: 'IT企業', basePrice: 10000, price: 10000, earnRate: 200, count: 0 },
    { id: 'factory', name: '工場', basePrice: 50000, price: 50000, earnRate: 1000, count: 0 },
    { id: 'bank', name: '銀行', basePrice: 200000, price: 200000, earnRate: 5000, count: 0 },
  ];

  private moneyText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private saveMessage!: Phaser.GameObjects.Text;
  
  private shopContainer!: Phaser.GameObjects.Container;
  private isShopOpen: boolean = false;
  private clickEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('MainScene');
  }

  create() {
    const { width, height } = this.scale;

    this.loadGame();
    this.cameras.main.setBackgroundColor('#87CEEB');
    this.add.rectangle(width / 2, height - 50, width, 100, 0x4caf50);

    // パーティクル設定
    this.clickEmitter = this.add.particles(0, 0, 'flare', {
      lifespan: 500,
      speed: { min: 150, max: 300 },
      scale: { start: 0.5, end: 0 },
      gravityY: 300,
      emitting: false,
    });
    
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffff00, 1);
    graphics.fillRect(0, 0, 10, 10);
    graphics.generateTexture('flare', 10, 10);

    // 本社ビル
    this.createOfficeBuilding(width / 2, height / 2);

    // UI関連
    this.createHeaderUI();
    this.createShopButton(width / 2, height - 80);
    
    // ★ここが重要：ショップウィンドウを作る（レスポンシブ対応版）
    this.createShopWindow();

    this.saveMessage = this.add.text(width - 20, height - 20, 'Auto Saved', {
      fontSize: '16px', color: '#ffffff', backgroundColor: '#000000'
    }).setOrigin(1, 1).setAlpha(0);

    this.time.addEvent({ delay: 1000, callback: () => this.autoEarn(), loop: true });
    this.time.addEvent({ delay: 10000, callback: () => this.saveGame(), loop: true });

    this.updateUI();
  }

  // --- 演出関連 ---

  private showFloatingText(x: number, y: number, text: string, color: string = '#ffffff') {
    const floatText = this.add.text(x, y, text, {
      fontSize: '24px', color: color, fontFamily: 'Arial', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({
      targets: floatText, y: y - 50, alpha: 0, duration: 1000, ease: 'Power1',
      onComplete: () => floatText.destroy()
    });
  }

  private bumpMoneyText() {
    this.tweens.add({ targets: this.moneyText, scaleX: 1.2, scaleY: 1.2, duration: 50, yoyo: true });
  }

  // --- 描画・UI関連 ---

  private createOfficeBuilding(x: number, y: number) {
    const buildingContainer = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, 150, 200, 0x555555);
    const windows = [
      this.add.rectangle(-40, -50, 30, 30, 0xadd8e6), this.add.rectangle(40, -50, 30, 30, 0xadd8e6),
      this.add.rectangle(-40, 20, 30, 30, 0xadd8e6), this.add.rectangle(40, 20, 30, 30, 0xadd8e6)
    ];
    const door = this.add.rectangle(0, 80, 40, 40, 0x333333);
    
    buildingContainer.add([body, ...windows, door]);
    body.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.earnMoney(100);
      this.showFloatingText(pointer.x, pointer.y, '+100', '#00ff00');
      this.clickEmitter.emitParticleAt(pointer.x, pointer.y, 10);
      this.tweens.add({ targets: buildingContainer, scaleY: 0.95, scaleX: 1.05, duration: 50, yoyo: true });
    });
  }

  private createHeaderUI() {
    this.add.rectangle(0, 0, this.scale.width, 90, 0x000000, 0.7).setOrigin(0, 0);
    this.moneyText = this.add.text(20, 20, '所持金: 0円', {
      fontSize: '32px', color: '#ffd700', fontFamily: 'Arial', fontStyle: 'bold'
    });
    this.incomeText = this.add.text(20, 60, '収益: 0円/秒', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial'
    });
  }

  private createShopButton(x: number, y: number) {
    const btn = this.add.rectangle(0, 0, 200, 60, 0xffffff).setStrokeStyle(4, 0x000000);
    const text = this.add.text(0, 0, 'ショップ', {
      fontSize: '24px', color: '#000000', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [btn, text]);
    btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleShop());
  }

  // ★ここを大幅改修：画面サイズに応じたウィンドウ作成
  private createShopWindow() {
    const { width, height } = this.scale;
    this.shopContainer = this.add.container(width / 2, height / 2);
    
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setInteractive();
    
    // ★変更点：ウィンドウ幅を「画面幅の90%」か「最大500px」の小さい方に合わせる
    const windowWidth = Math.min(500, width * 0.9);
    const windowHeight = 450;

    const bg = this.add.rectangle(0, 0, windowWidth, windowHeight, 0xf0f0f0).setStrokeStyle(4, 0x333333);
    const title = this.add.text(0, -windowHeight / 2 + 35, '物件ショップ', {
      fontSize: '28px', color: '#333333', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    const closeBtn = this.add.text(windowWidth / 2 - 30, -windowHeight / 2 + 35, '×', {
      fontSize: '40px', color: '#ff0000', fontFamily: 'Arial'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleShop());

    this.shopContainer.add([overlay, bg, title, closeBtn]);

    // アイテムリスト
    let yPos = -120;
    this.items.forEach((item, index) => {
      if (index >= 5) return;

      // ★変更点：リストアイテムの幅もウィンドウに合わせて調整
      const itemWidth = windowWidth - 40; // 左右20pxの余白
      const itemBg = this.add.rectangle(0, yPos, itemWidth, 80, 0xffffff).setStrokeStyle(2, 0xaaaaaa);
      
      // 文字やボタンの位置を相対的に計算
      const textX = -itemWidth / 2 + 20; // 左端
      const btnX = itemWidth / 2 - 70;   // 右端

      const infoText = this.add.text(textX, yPos - 20, `${item.name} (Lv.${item.count})`, {
        fontSize: '20px', color: '#333333', fontFamily: 'Arial', fontStyle: 'bold'
      });
      const earnText = this.add.text(textX, yPos + 10, `収益: +${item.earnRate}/秒`, {
        fontSize: '14px', color: '#666666', fontFamily: 'Arial'
      });

      const buyBtn = this.add.rectangle(btnX, yPos, 100, 50, 0x4caf50).setInteractive({ useHandCursor: true });
      const buyText = this.add.text(btnX, yPos, `${item.price}`, {
        fontSize: '18px', color: '#ffffff', fontFamily: 'Arial'
      }).setOrigin(0.5);

      buyBtn.on('pointerdown', () => this.buyItem(index));

      this.shopContainer.add([itemBg, infoText, earnText, buyBtn, buyText]);

      item.uiNameText = infoText;
      item.uiPriceText = buyText;
      item.uiButton = buyBtn;

      yPos += 90;
    });

    this.shopContainer.setVisible(false);
  }

  // --- ロジック関連 ---

  private toggleShop() {
    this.isShopOpen = !this.isShopOpen;
    this.shopContainer.setVisible(this.isShopOpen);
    if (this.isShopOpen) this.updateShopUI();
  }

  private earnMoney(amount: number) {
    this.money += amount;
    this.updateUI();
    this.bumpMoneyText();
  }

  private buyItem(index: number) {
    const item = this.items[index];
    if (this.money >= item.price) {
      this.money -= item.price;
      item.count++;
      item.price = Math.floor(item.price * 1.5);
      
      this.updateUI();
      this.updateShopUI();
      this.saveGame();
      this.showFloatingText(this.scale.width / 2, this.scale.height / 2, '購入完了!', '#ffff00');
    } else {
      this.cameras.main.shake(100, 0.005);
    }
  }

  private autoEarn() {
    let totalEarn = 0;
    this.items.forEach(item => totalEarn += item.count * item.earnRate);
    if (totalEarn > 0) {
      this.earnMoney(totalEarn);
      const x = this.scale.width / 2 + Phaser.Math.Between(-50, 50);
      const y = this.scale.height / 2 + Phaser.Math.Between(-50, 50);
      this.showFloatingText(x, y, `+${totalEarn}`, '#88ccff');
    }
  }

  private updateUI() {
    this.moneyText.setText(`所持金: ${this.money.toLocaleString()}円`);
    let totalEarn = 0;
    this.items.forEach(item => totalEarn += item.count * item.earnRate);
    this.incomeText.setText(`収益: ${totalEarn.toLocaleString()}円/秒`);
  }

  private updateShopUI() {
    this.items.forEach(item => {
      if (item.uiNameText && item.uiPriceText && item.uiButton) {
        item.uiNameText.setText(`${item.name} (Lv.${item.count})`);
        item.uiPriceText.setText(`${item.price.toLocaleString()}`); // 円記号を省略してスペース確保
        if (this.money >= item.price) {
          item.uiButton.setFillStyle(0x4caf50);
        } else {
          item.uiButton.setFillStyle(0x888888);
        }
      }
    });
  }

  private saveGame() {
    const saveData: GameSaveData = {
      money: this.money,
      items: this.items.map(item => ({ id: item.id, count: item.count, price: item.price }))
    };
    localStorage.setItem('tycoon_save_v2', JSON.stringify(saveData));
    this.saveMessage.setAlpha(1);
    this.tweens.add({ targets: this.saveMessage, alpha: 0, duration: 1000, delay: 500 });
  }

  private loadGame() {
    const rawData = localStorage.getItem('tycoon_save_v2');
    if (rawData) {
      const saveData = JSON.parse(rawData) as GameSaveData;
      this.money = saveData.money;
      saveData.items.forEach(savedItem => {
        const targetItem = this.items.find(i => i.id === savedItem.id);
        if (targetItem) {
          targetItem.count = savedItem.count;
          targetItem.price = savedItem.price;
        }
      });
    }
  }
}