import Phaser from 'phaser';

// ■ アイテム定義（ハンバーガー屋バージョン）
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

// ■ 実績定義
type Achievement = {
  id: string;
  title: string;
  condition: (scene: MainScene) => boolean;
  unlocked: boolean;
};

// ■ セーブデータ定義（店名を追加）
type GameSaveData = {
  shopName: string; // ★店名
  money: number;
  items: { id: string; count: number; price: number }[];
  unlockedAchievementIds: string[];
  lastSaveTime: number;
};

export class MainScene extends Phaser.Scene {
  public money: number = 0;
  public shopName: string = ''; // 現在の店名

  // ★ハンバーガー屋らしいアイテムリスト
  public items: ShopItem[] = [
    { id: 'fryer', name: '高性能フライヤー', basePrice: 500, price: 500, earnRate: 10, count: 0 },
    { id: 'drink', name: 'ドリンクバー', basePrice: 2500, price: 2500, earnRate: 40, count: 0 },
    { id: 'part_time', name: 'アルバイト雇用', basePrice: 10000, price: 10000, earnRate: 150, count: 0 },
    { id: 'delivery', name: 'デリバリーバイク', basePrice: 50000, price: 50000, earnRate: 800, count: 0 },
    { id: 'branch', name: '2号店オープン', basePrice: 200000, price: 200000, earnRate: 3500, count: 0 },
    { id: 'franchise', name: 'フランチャイズ化', basePrice: 1000000, price: 1000000, earnRate: 15000, count: 0 },
  ];

  // ★実績リスト
  private achievements: Achievement[] = [
    { 
      id: 'first_fry', title: 'ポテト始めました\n(フライヤー購入)', 
      condition: (s) => s.getItemCount('fryer') >= 1, unlocked: false 
    },
    { 
      id: 'manager', title: '一人前の店長\n(所持金10万円)', 
      condition: (s) => s.money >= 100000, unlocked: false 
    },
    { 
      id: 'chain_store', title: 'チェーン店化\n(2号店オープン)', 
      condition: (s) => s.getItemCount('branch') >= 1, unlocked: false 
    },
  ];

  private moneyText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private shopNameText!: Phaser.GameObjects.Text; // 店名表示用
  private saveMessage!: Phaser.GameObjects.Text;
  
  private shopContainer!: Phaser.GameObjects.Container;
  private isShopOpen: boolean = false;
  private clickEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  private achievementContainer!: Phaser.GameObjects.Container;
  private achievementText!: Phaser.GameObjects.Text;

  constructor() {
    super('MainScene');
  }

  create() {
    const { width, height } = this.scale;

    // 背景色（少し明るいオレンジ系にして食欲をそそる色に）
    this.cameras.main.setBackgroundColor('#FFDAB9'); // PeachPuff色
    // 地面（茶色）
    this.add.rectangle(width / 2, height - 50, width, 100, 0x8B4513);

    // パーティクル（ケチャップとマスタードの色）
    this.clickEmitter = this.add.particles(0, 0, 'flare', {
      lifespan: 500, speed: { min: 150, max: 300 }, scale: { start: 0.5, end: 0 }, gravityY: 300, emitting: false,
    });
    // パーティクルのテクスチャ作成
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xFF6347, 1); // トマト色
    graphics.fillRect(0, 0, 10, 10);
    graphics.generateTexture('flare', 10, 10);

    // データのロード（ロード後に店名チェックが入る）
    this.loadGame();

    // ★店名未設定なら入力させる
    if (!this.shopName) {
      this.askShopName();
    }

    // ハンバーガーショップの建物
    this.createBurgerShop(width / 2, height / 2);

    // UI関連
    this.createHeaderUI();
    this.createShopButton(width / 2, height - 80);
    this.createShopWindow();
    this.createAchievementUI();

    this.saveMessage = this.add.text(width - 20, height - 20, 'Auto Saved', {
      fontSize: '16px', color: '#ffffff', backgroundColor: '#000000'
    }).setOrigin(1, 1).setAlpha(0);

    // タイマー
    this.time.addEvent({ delay: 1000, callback: () => this.autoEarn(), loop: true });
    this.time.addEvent({ delay: 10000, callback: () => this.saveGame(), loop: true });
    this.events.on('update', () => this.checkAchievements());

    this.updateUI();
  }

  // ★店名を決める処理
  private askShopName() {
    // ブラウザの入力ダイアログを出す
    // ※ゲーム画面が止まることがありますが、仕様です
    let name = window.prompt("新しいハンバーガーショップを開店します！\nお店の名前を決めてください：", "バーガーハウス");
    
    // キャンセルされたり空欄だった場合のデフォルト名
    if (!name || name.trim() === "") {
      name = "名無しのバーガー屋";
    }
    
    this.shopName = name;
    this.saveGame(); // すぐ保存
  }

  // ★ハンバーガーショップを描画（見た目変更）
  private createBurgerShop(x: number, y: number) {
    const shopContainer = this.add.container(x, y);

    // お店本体（クリーム色）
    const body = this.add.rectangle(0, 50, 200, 150, 0xFFFACD);
    body.setStrokeStyle(4, 0x8B4513);

    // 屋根（赤の台形）
    // Phaserで台形や三角形を描くのは少し複雑なので、Graphicを使う
    const roof = this.add.graphics();
    roof.fillStyle(0xFF0000, 1); // 赤
    // 三角屋根を描くパス
    roof.beginPath();
    roof.moveTo(-120, -25); // 左下
    roof.lineTo(0, -100);   // 頂点
    roof.lineTo(120, -25);  // 右下
    roof.closePath();
    roof.fillPath();

    // 看板（BURGERの文字）
    const signBoard = this.add.rectangle(0, -40, 160, 40, 0xFFFFFF);
    const signText = this.add.text(0, -40, 'BURGER', {
      fontSize: '24px', color: '#FF0000', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5);

    // ドアと窓
    const door = this.add.rectangle(0, 100, 50, 50, 0x8B4513);
    const windowL = this.add.rectangle(-60, 50, 40, 40, 0x87CEEB);
    const windowR = this.add.rectangle(60, 50, 40, 40, 0x87CEEB);

    shopContainer.add([body, roof, signBoard, signText, door, windowL, windowR]);

    // クリック判定（建物全体を覆う透明な四角で判定）
    const hitArea = this.add.rectangle(0, 0, 240, 250, 0x000000, 0).setInteractive({ useHandCursor: true });
    shopContainer.add(hitArea);

    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.earnMoney(100);
      this.showFloatingText(pointer.x, pointer.y, '+100円', '#FF4500'); // オレンジ色の文字
      this.clickEmitter.emitParticleAt(pointer.x, pointer.y, 10);
      
      this.tweens.add({
        targets: shopContainer, scaleY: 0.95, scaleX: 1.05, duration: 50, yoyo: true
      });
    });
  }

  // --- 以下、既存機能の微調整 ---

  private createHeaderUI() {
    this.add.rectangle(0, 0, this.scale.width, 100, 0x000000, 0.7).setOrigin(0, 0);
    
    // 店名表示
    this.shopNameText = this.add.text(20, 15, '', {
      fontSize: '24px', color: '#FFA500', fontFamily: 'Arial', fontStyle: 'bold'
    });

    this.moneyText = this.add.text(20, 50, '所持金: 0円', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'Arial'
    });
    this.incomeText = this.add.text(20, 80, '売上: 0円/秒', { // 「収益」→「売上」へ変更
      fontSize: '18px', color: '#cccccc', fontFamily: 'Arial'
    });
  }

  private updateUI() {
    this.shopNameText.setText(this.shopName || '読込中...');
    this.moneyText.setText(`所持金: ${this.money.toLocaleString()}円`);
    let totalEarn = 0;
    this.items.forEach(item => totalEarn += item.count * item.earnRate);
    this.incomeText.setText(`売上: ${totalEarn.toLocaleString()}円/秒`);
  }

  // ----------------------------------------------------------------
  // ■ 基本ロジック（そのまま）
  // ----------------------------------------------------------------

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

  private createAchievementUI() {
    const { width } = this.scale;
    this.achievementContainer = this.add.container(width / 2, -100);
    const bg = this.add.rectangle(0, 0, 400, 80, 0x222222).setStrokeStyle(2, 0xffd700);
    const icon = this.add.text(-170, 0, '🏆', { fontSize: '40px' }).setOrigin(0.5);
    this.achievementText = this.add.text(0, 0, '', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', align: 'center'
    }).setOrigin(0.5);
    this.achievementContainer.add([bg, icon, this.achievementText]);
  }

  private showAchievementToast(title: string) {
    this.achievementText.setText(`実績解除！\n${title}`);
    this.tweens.add({
      targets: this.achievementContainer, y: 60, duration: 500, ease: 'Back.out', hold: 3000, yoyo: true,
    });
    this.showFloatingText(this.scale.width / 2, 150, 'CONGRATULATIONS!', '#ffd700');
  }

  private createShopButton(x: number, y: number) {
    const btn = this.add.rectangle(0, 0, 200, 60, 0xffffff).setStrokeStyle(4, 0x000000);
    const text = this.add.text(0, 0, '経営メニュー', { // 文言変更
      fontSize: '24px', color: '#000000', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.container(x, y, [btn, text]);
    btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleShop());
  }

  private createShopWindow() {
    const { width, height } = this.scale;
    this.shopContainer = this.add.container(width / 2, height / 2);
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.5).setInteractive();
    const windowWidth = Math.min(500, width * 0.9);
    const windowHeight = 450;
    const bg = this.add.rectangle(0, 0, windowWidth, windowHeight, 0xf0f0f0).setStrokeStyle(4, 0x333333);
    const title = this.add.text(0, -windowHeight / 2 + 35, '設備・店舗拡大', { // 文言変更
      fontSize: '28px', color: '#333333', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    const closeBtn = this.add.text(windowWidth / 2 - 30, -windowHeight / 2 + 35, '×', {
      fontSize: '40px', color: '#ff0000', fontFamily: 'Arial'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleShop());
    this.shopContainer.add([overlay, bg, title, closeBtn]);

    let yPos = -120;
    this.items.forEach((item, index) => {
      if (index >= 5) return;
      const itemWidth = windowWidth - 40;
      const itemBg = this.add.rectangle(0, yPos, itemWidth, 80, 0xffffff).setStrokeStyle(2, 0xaaaaaa);
      const textX = -itemWidth / 2 + 20;
      const btnX = itemWidth / 2 - 70;
      const infoText = this.add.text(textX, yPos - 20, `${item.name} (Lv.${item.count})`, {
        fontSize: '20px', color: '#333333', fontFamily: 'Arial', fontStyle: 'bold'
      });
      const earnText = this.add.text(textX, yPos + 10, `売上: +${item.earnRate}/秒`, {
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

  public getItemCount(id: string): number {
    const item = this.items.find(i => i.id === id);
    return item ? item.count : 0;
  }

  private checkAchievements() {
    this.achievements.forEach(achievement => {
      if (!achievement.unlocked && achievement.condition(this)) {
        achievement.unlocked = true;
        this.showAchievementToast(achievement.title);
        this.saveGame();
      }
    });
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

  private updateShopUI() {
    this.items.forEach(item => {
      if (item.uiNameText && item.uiPriceText && item.uiButton) {
        item.uiNameText.setText(`${item.name} (Lv.${item.count})`);
        item.uiPriceText.setText(`${item.price.toLocaleString()}`);
        if (this.money >= item.price) {
          item.uiButton.setFillStyle(0x4caf50);
        } else {
          item.uiButton.setFillStyle(0x888888);
        }
      }
    });
  }

  private saveGame() {
    const unlockedIds = this.achievements.filter(a => a.unlocked).map(a => a.id);
    const saveData: GameSaveData = {
      shopName: this.shopName, // ★店名も保存
      money: this.money,
      items: this.items.map(item => ({ id: item.id, count: item.count, price: item.price })),
      unlockedAchievementIds: unlockedIds,
      lastSaveTime: Date.now()
    };
    // データ形式が変わったので v4 にします
    localStorage.setItem('tycoon_save_v4', JSON.stringify(saveData)); 
    
    this.saveMessage.setAlpha(1);
    this.tweens.add({ targets: this.saveMessage, alpha: 0, duration: 1000, delay: 500 });
  }

  private loadGame() {
    let rawData = localStorage.getItem('tycoon_save_v4');
    // v4がなければv3（前のデータ）を探す
    if (!rawData) rawData = localStorage.getItem('tycoon_save_v3');

    if (rawData) {
      const saveData = JSON.parse(rawData) as GameSaveData;
      this.money = saveData.money;
      this.shopName = saveData.shopName || ''; // 読み込み、なければ空

      saveData.items.forEach(savedItem => {
        const targetItem = this.items.find(i => i.id === savedItem.id);
        if (targetItem) {
          targetItem.count = savedItem.count;
          targetItem.price = savedItem.price;
        }
      });
      if (saveData.unlockedAchievementIds) {
        saveData.unlockedAchievementIds.forEach(id => {
          const achievement = this.achievements.find(a => a.id === id);
          if (achievement) achievement.unlocked = true;
        });
      }
      if (saveData.lastSaveTime) {
        const now = Date.now();
        const diffSeconds = Math.floor((now - saveData.lastSaveTime) / 1000);
        if (diffSeconds > 10) {
          let totalRate = 0;
          this.items.forEach(item => totalRate += item.count * item.earnRate);
          const offlineEarnings = totalRate * diffSeconds;
          if (offlineEarnings > 0) {
            this.money += offlineEarnings;
            this.showOfflineEarningsPopup(offlineEarnings, diffSeconds);
          }
        }
      }
    }
  }

  private showOfflineEarningsPopup(amount: number, seconds: number) {
    const { width, height } = this.scale;
    const container = this.add.container(width / 2, height / 2);
    const bg = this.add.rectangle(0, 0, 400, 250, 0x000000, 0.9).setStrokeStyle(4, 0x00ff00);
    const title = this.add.text(0, -80, 'お帰りなさい！', { fontSize: '32px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5);
    const desc = this.add.text(0, -20, `${seconds}秒間、店を回しておきました。\n売上報告：`, { fontSize: '20px', color: '#ffffff', align: 'center' }).setOrigin(0.5);
    const amountText = this.add.text(0, 50, `+${amount.toLocaleString()}円`, { fontSize: '48px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
    const closeText = this.add.text(0, 100, '(クリックして閉じる)', { fontSize: '16px', color: '#aaaaaa' }).setOrigin(0.5);
    container.add([bg, title, desc, amountText, closeText]);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => container.destroy());
  }
}