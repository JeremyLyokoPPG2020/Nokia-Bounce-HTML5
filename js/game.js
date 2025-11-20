// ----- GAME CONFIG -----
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#A0D0E0",
  physics: {
    default: "matter",
    matter: {
      gravity: { y: 1.2 }, // tweak to taste
      debug: false         // set true to see hitboxes
    }
  },
  scene: {
    preload,
    create,
    update
  }
};

let game = new Phaser.Game(config);

// ----- GLOBALS -----
let player;
let cursors;
let spaceKey;

let platforms = [];
let triangles = [];
let spikes = [];
let goal = null;

let groundContacts = 0; // how many ground bodies touching the player

// ----- PRELOAD -----
function preload() {
  this.load.image("ball", "assets/img/ball.png");

  // tile image (for walls and floor), MUST be tileable
  this.load.image("tile", "assets/img/tile.png");

  // triangle image: right-triangle, pointing UP, cut from tile graphic
  this.load.image("triangle", "assets/img/tile.png");

  this.load.image("spike", "assets/img/spike.png");
  this.load.image("goal", "assets/img/goal.png");

  // Level JSON
  this.load.json("level1", "assets/levels/level1.json");
}

// ----- CREATE -----
function create() {
  const levelData = this.cache.json.get("level1");
  const MatterLib = Phaser.Physics.Matter.Matter;
  const Bodies = MatterLib.Bodies;

  platforms = [];
  triangles = [];
  spikes = [];
  goal = null;

  // ----- PLATFORMS (non-stretched tiles) -----
  // Expected: { x, y, width, height }
  if (Array.isArray(levelData.platforms)) {
    levelData.platforms.forEach(p => {
      // Visual: repeating tile, not stretched
      const platform = this.add.tileSprite(p.x, p.y, p.width, p.height, "tile");

      // Physics: static rectangle body that matches the visual size
      this.matter.add.gameObject(platform, {
        isStatic: true,
        shape: {
          type: "rectangle",
          width: p.width,
          height: p.height
        }
      });

      platform.setOrigin(0.5);
      platform.setData("type", "ground");
      platforms.push(platform);
    });
  }

  // ----- TRIANGLES (real sloped ground) -----
  // Expected: { x, y, width, height, orientation: "up"|"down"|"left"|"right" }
  if (Array.isArray(levelData.triangles)) {
    levelData.triangles.forEach(t => {
      // Visual sprite using triangle.png
      const triSprite = this.matter.add.sprite(t.x, t.y, "triangle", null, {
        isStatic: true
      });

      // Scale triangle image to desired size (can be 1:1 with texture or scaled)
      triSprite.setDisplaySize(t.width, t.height);
      triSprite.setOrigin(0.5);

      const w = t.width;
      const h = t.height;
      let verts;

      // Vertices are defined around (0,0) and we later attach to the sprite
      switch (t.orientation) {
        case "up":
          // base at bottom, apex at top
          verts = [
            { x: -w / 2, y:  h / 2 },
            { x:  w / 2, y:  h / 2 },
            { x:  0,     y: -h / 2 }
          ];
          triSprite.setAngle(0);
          break;

        case "down":
          // base at top, apex at bottom
          verts = [
            { x: -w / 2, y: -h / 2 },
            { x:  w / 2, y: -h / 2 },
            { x:  0,     y:  h / 2 }
          ];
          triSprite.setAngle(180);
          break;

        case "left":
          // base on right, apex on left
          verts = [
            { x:  w / 2, y: -h / 2 },
            { x:  w / 2, y:  h / 2 },
            { x: -w / 2, y:  0     }
          ];
          triSprite.setAngle(-90);
          break;

        case "right":
        default:
          // base on left, apex on right
          verts = [
            { x: -w / 2, y: -h / 2 },
            { x: -w / 2, y:  h / 2 },
            { x:  w / 2, y:  0     }
          ];
          triSprite.setAngle(90);
          break;
      }

      // Create static triangle body from vertices (origin at 0,0)
      const body = Bodies.fromVertices(0, 0, verts, { isStatic: true }, true);
      triSprite.setExistingBody(body);
      triSprite.setPosition(t.x, t.y); // move into place

      triSprite.setData("type", "ground");
      triangles.push(triSprite);
    });
  }

  // ----- SPIKES (sensors) -----
  // Expected: { x, y }
  if (Array.isArray(levelData.spikes)) {
    levelData.spikes.forEach(s => {
      const spike = this.matter.add.sprite(s.x, s.y, "spike", null, {
        isStatic: true,
        isSensor: true
      });
      spike.setOrigin(0.5, 1); // bottom aligned
      spike.setData("type", "spike");
      spikes.push(spike);
    });
  }

  // ----- GOAL (sensor) -----
  if (levelData.goal) {
    goal = this.matter.add.sprite(levelData.goal.x, levelData.goal.y, "goal", null, {
      isStatic: true,
      isSensor: true
    });
    goal.setData("type", "goal");
  }

  // ----- PLAYER (ball) -----
  player = this.matter.add.sprite(levelData.player.x, levelData.player.y, "ball");
  player.setCircle(player.width / 2); // circular body for rolling
  player.setBounce(0.2);
  player.setFriction(0.001);
  player.setFrictionAir(0.02);
  player.setData("type", "player");

  // ----- WORLD & CAMERA BOUNDS -----
  let levelWidth = GAME_WIDTH;

  if (Array.isArray(levelData.platforms) && levelData.platforms.length > 0) {
    const maxRight = Math.max(
      ...levelData.platforms.map(p => p.x + p.width / 2)
    );
    levelWidth = Math.max(GAME_WIDTH, maxRight + 100);
  }

  const levelHeight = GAME_HEIGHT; // change if you have tall vertical levels

  this.matter.world.setBounds(0, 0, levelWidth, levelHeight);
  this.cameras.main.setBounds(0, 0, levelWidth, levelHeight);

  // Follow the ball
  this.cameras.main.startFollow(player, true, 0.1, 0.1);
  // this.cameras.main.setFollowOffset(0, 50); // optional

  // ----- INPUT -----
  cursors = this.input.keyboard.createCursorKeys();
  spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  // ----- COLLISION EVENTS -----
  groundContacts = 0;

  this.matter.world.on("collisionstart", event => {
    event.pairs.forEach(pair => {
      const a = pair.bodyA.gameObject;
      const b = pair.bodyB.gameObject;
      if (!a || !b) return;

      const typeA = a.getData("type");
      const typeB = b.getData("type");

      // player vs ground (platforms & triangles)
      if (isPlayerAnd(typeA, typeB, "ground")) {
        groundContacts++;
      }

      // player vs spike
      if (isPlayerAnd(typeA, typeB, "spike")) {
        hitSpike();
      }

      // player vs goal
      if (isPlayerAnd(typeA, typeB, "goal")) {
        reachGoal(this);
      }
    });
  });

  this.matter.world.on("collisionend", event => {
    event.pairs.forEach(pair => {
      const a = pair.bodyA.gameObject;
      const b = pair.bodyB.gameObject;
      if (!a || !b) return;

      const typeA = a.getData("type");
      const typeB = b.getData("type");

      if (isPlayerAnd(typeA, typeB, "ground")) {
        groundContacts = Math.max(0, groundContacts - 1);
      }
    });
  });
}

// Helper: check if one is player and other matches type
function isPlayerAnd(typeA, typeB, otherType) {
  return (
    (typeA === "player" && typeB === otherType) ||
    (typeB === "player" && typeA === otherType)
  );
}

// ----- UPDATE -----
function update() {
  if (!player) return;

  // Feel free to tweak these
  const speed = 4;       // horizontal speed
  const jumpSpeed = -8;  // jump impulse (negative = up)

  // Horizontal move
  if (cursors.left.isDown) {
    player.setVelocityX(-speed);
  } else if (cursors.right.isDown) {
    player.setVelocityX(speed);
  } else {
    player.setVelocityX(0);
  }

  // Jump only when touching ground
  const wantJump = spaceKey.isDown || cursors.up.isDown;
  if (wantJump && groundContacts > 0) {
    player.setVelocityY(jumpSpeed);
  }
}

// ----- COLLISION HANDLERS -----
function hitSpike() {
  const scene = player.scene;
  const levelData = scene.cache.json.get("level1");

  // Reset player to start
  player.setPosition(levelData.player.x, levelData.player.y);
  player.setVelocity(0, 0);
}

function reachGoal(scene) {
  console.log("Goal reached!");
  // For now: restart scene. Later: load next level
  scene.scene.restart();
}
