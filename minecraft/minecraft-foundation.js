(function () {
  const CHUNK_SIZE = 16;
  const WORLD_HEIGHT = 18;
  const LOAD_RADIUS = 1;
  const PLAYER_HEIGHT = 1.7;
  const PLAYER_RADIUS = 0.32;
  const EYE_HEIGHT = 1.55;
  const MOVE_SPEED = 4.8;
  const GRAVITY = 18;
  const JUMP_SPEED = 7.5;
  const RAYCAST_MAX_DISTANCE = 6;

  const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
  };

  const FACE_DEFS = [
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: "grassTop" },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: "dirt" },
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: "side" },
    { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: "side" },
    { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: "side" },
    { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: "side" },
  ];

  const canvas = document.getElementById("scene");
  const regenButton = document.getElementById("regen-btn");
  const stats = {
    chunkSize: document.getElementById("chunk-size"),
    visibleFaces: document.getElementById("visible-faces"),
    triangles: document.getElementById("triangles"),
    maxHeight: document.getElementById("max-height"),
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe7ff, 30, 110);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 220);

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x5e7b57, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0c2, 1.1);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const crosshair = buildCrosshair();
  scene.add(crosshair);

  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  highlight.visible = false;
  scene.add(highlight);

  const state = {
    seed: Math.random() * 1000,
    keys: new Set(),
    yaw: 0,
    pitch: -0.08,
    velocity: new THREE.Vector3(),
    playerPos: new THREE.Vector3(8.5, 12, 8.5),
    onGround: false,
    pointerLocked: false,
    chunks: new Map(),
    currentChunkKey: null,
    totalFaces: 0,
    totalTriangles: 0,
    worldMaxHeight: 0,
    targetBlock: null,
  };

  const atlas = createTextureAtlas();
  const material = new THREE.MeshLambertMaterial({ map: atlas.texture });

  updateLoadedChunks(true);
  placePlayerOnTop();
  resize();
  updateCamera();
  refreshStats();

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("mousedown", onMouseDown);
  regenButton.addEventListener("click", regenerateWorld);

  let lastTime = performance.now();
  requestAnimationFrame(tick);

  function tick(now) {
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    updatePlayer(delta);
    updateLoadedChunks(false);
    updateSelection();
    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function regenerateWorld() {
    state.seed = Math.random() * 1000;
    clearWorld();
    updateLoadedChunks(true);
    placePlayerOnTop();
    updateSelection();
    refreshStats();
  }

  function clearWorld() {
    for (const chunk of state.chunks.values()) {
      if (chunk.mesh) {
        worldRoot.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
      }
    }
    state.chunks.clear();
    state.currentChunkKey = null;
  }

  function updateLoadedChunks(force) {
    const centerChunkX = Math.floor(state.playerPos.x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(state.playerPos.z / CHUNK_SIZE);
    const centerKey = chunkKey(centerChunkX, centerChunkZ);

    if (!force && state.currentChunkKey === centerKey) {
      return;
    }

    state.currentChunkKey = centerKey;
    const needed = new Set();

    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz += 1) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx += 1) {
        const cx = centerChunkX + dx;
        const cz = centerChunkZ + dz;
        const key = chunkKey(cx, cz);
        needed.add(key);
        if (!state.chunks.has(key)) {
          const chunk = createChunk(cx, cz);
          state.chunks.set(key, chunk);
        }
      }
    }

    for (const [key, chunk] of state.chunks.entries()) {
      if (!needed.has(key)) {
        if (chunk.mesh) {
          worldRoot.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
        }
        state.chunks.delete(key);
      }
    }

    for (const key of needed) {
      const chunk = state.chunks.get(key);
      if (!chunk.mesh) {
        rebuildChunkMesh(chunk);
      }
    }

    refreshStats();
  }

  function createChunk(chunkX, chunkZ) {
    const voxels = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    let localMaxHeight = 0;

    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const worldX = chunkX * CHUNK_SIZE + x;
        const worldZ = chunkZ * CHUNK_SIZE + z;
        const height = terrainHeight(worldX, worldZ);
        localMaxHeight = Math.max(localMaxHeight, height);

        for (let y = 0; y <= height; y += 1) {
          let block = BLOCK.STONE;
          if (y === height) {
            block = BLOCK.GRASS;
          } else if (y >= height - 2) {
            block = BLOCK.DIRT;
          }
          setLocalVoxel(voxels, x, y, z, block);
        }
      }
    }

    state.worldMaxHeight = Math.max(state.worldMaxHeight, localMaxHeight);

    return {
      key: chunkKey(chunkX, chunkZ),
      chunkX,
      chunkZ,
      voxels,
      mesh: null,
      visibleFaces: 0,
      triangles: 0,
      maxHeight: localMaxHeight,
    };
  }

  function rebuildChunkMesh(chunk) {
    if (chunk.mesh) {
      worldRoot.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }

    const geometry = buildChunkGeometry(chunk);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunk.chunkX * CHUNK_SIZE, 0, chunk.chunkZ * CHUNK_SIZE);
    mesh.userData.chunkKey = chunk.key;
    worldRoot.add(mesh);

    chunk.mesh = mesh;
    chunk.visibleFaces = geometry.userData.visibleFaces;
    chunk.triangles = geometry.index.count / 3;
  }

  function buildChunkGeometry(chunk) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let visibleFaces = 0;

    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const block = getLocalVoxel(chunk.voxels, x, y, z);
          if (block === BLOCK.AIR) {
            continue;
          }

          const blockName = getBlockTextureName(block);
          const worldX = chunk.chunkX * CHUNK_SIZE + x;
          const worldZ = chunk.chunkZ * CHUNK_SIZE + z;

          FACE_DEFS.forEach((face) => {
            const nx = worldX + face.dir[0];
            const ny = y + face.dir[1];
            const nz = worldZ + face.dir[2];
            if (getVoxelGlobal(nx, ny, nz) !== BLOCK.AIR) {
              return;
            }

            const indexOffset = positions.length / 3;
            const uvRect = atlas.uvMap[resolveTileName(blockName, face.tile)];

            face.corners.forEach((corner, i) => {
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);

              const uv =
                i === 0 ? [uvRect.u0, uvRect.v1] :
                i === 1 ? [uvRect.u1, uvRect.v1] :
                i === 2 ? [uvRect.u1, uvRect.v0] :
                [uvRect.u0, uvRect.v0];
              uvs.push(uv[0], uv[1]);
            });

            indices.push(
              indexOffset, indexOffset + 1, indexOffset + 2,
              indexOffset, indexOffset + 2, indexOffset + 3
            );
            visibleFaces += 1;
          });
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.userData.visibleFaces = visibleFaces;
    return geometry;
  }

  function terrainHeight(worldX, worldZ) {
    const hill = octaveNoise((worldX + state.seed) * 0.085, (worldZ + state.seed * 0.7) * 0.085, 4, 0.55);
    const ridge = octaveNoise((worldX + 19 + state.seed * 0.35) * 0.16, (worldZ - 11 + state.seed) * 0.16, 2, 0.45);
    const normalized = hill * 0.78 + ridge * 0.22;
    return Math.max(3, Math.min(WORLD_HEIGHT - 2, Math.floor(4 + normalized * 9)));
  }

  function placePlayerOnTop() {
    const x = Math.floor(state.playerPos.x);
    const z = Math.floor(state.playerPos.z);
    const y = findTopY(x, z);
    state.playerPos.set(x + 0.5, y + 0.01, z + 0.5);
    state.velocity.set(0, 0, 0);
    state.onGround = true;
  }

  function findTopY(worldX, worldZ) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
      if (getVoxelGlobal(worldX, y, worldZ) !== BLOCK.AIR) {
        return y + 1;
      }
    }
    return 6;
  }

  function updatePlayer(delta) {
    const moveInput = new THREE.Vector3();
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

    if (state.keys.has("KeyW")) moveInput.add(forward);
    if (state.keys.has("KeyS")) moveInput.sub(forward);
    if (state.keys.has("KeyA")) moveInput.sub(right);
    if (state.keys.has("KeyD")) moveInput.add(right);

    if (moveInput.lengthSq() > 0) {
      moveInput.normalize().multiplyScalar(MOVE_SPEED);
      state.velocity.x = moveInput.x;
      state.velocity.z = moveInput.z;
    } else {
      state.velocity.x = 0;
      state.velocity.z = 0;
    }

    state.velocity.y -= GRAVITY * delta;

    movePlayerAxis("x", state.velocity.x * delta);
    movePlayerAxis("z", state.velocity.z * delta);
    state.onGround = false;
    movePlayerAxis("y", state.velocity.y * delta);

    if (state.playerPos.y < -6) {
      placePlayerOnTop();
    }
  }

  function movePlayerAxis(axis, amount) {
    if (amount === 0) {
      return;
    }

    state.playerPos[axis] += amount;
    const box = getPlayerAabb();
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minY = Math.floor(box.min.y);
    const maxY = Math.floor(box.max.y);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (getVoxelGlobal(x, y, z) === BLOCK.AIR) {
            continue;
          }

          if (!aabbIntersects(box, { min: { x, y, z }, max: { x: x + 1, y: y + 1, z: z + 1 } })) {
            continue;
          }

          if (axis === "x") {
            state.playerPos.x = amount > 0 ? x - PLAYER_RADIUS : x + 1 + PLAYER_RADIUS;
            state.velocity.x = 0;
          } else if (axis === "z") {
            state.playerPos.z = amount > 0 ? z - PLAYER_RADIUS : z + 1 + PLAYER_RADIUS;
            state.velocity.z = 0;
          } else {
            if (amount > 0) {
              state.playerPos.y = y - PLAYER_HEIGHT;
            } else {
              state.playerPos.y = y + 1;
              state.onGround = true;
            }
            state.velocity.y = 0;
          }
          return;
        }
      }
    }
  }

  function getPlayerAabb() {
    return {
      min: {
        x: state.playerPos.x - PLAYER_RADIUS,
        y: state.playerPos.y,
        z: state.playerPos.z - PLAYER_RADIUS,
      },
      max: {
        x: state.playerPos.x + PLAYER_RADIUS,
        y: state.playerPos.y + PLAYER_HEIGHT,
        z: state.playerPos.z + PLAYER_RADIUS,
      },
    };
  }

  function aabbIntersects(a, b) {
    return (
      a.min.x < b.max.x && a.max.x > b.min.x &&
      a.min.y < b.max.y && a.max.y > b.min.y &&
      a.min.z < b.max.z && a.max.z > b.min.z
    );
  }

  function updateSelection() {
    const origin = camera.position.clone();
    const direction = new THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      Math.cos(state.yaw) * Math.cos(state.pitch)
    ).normalize();

    const hit = raycastBlock(origin, direction, RAYCAST_MAX_DISTANCE);
    state.targetBlock = hit;

    if (!hit) {
      highlight.visible = false;
      return;
    }

    highlight.visible = true;
    highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
  }

  function raycastBlock(origin, direction, maxDistance) {
    const step = 0.05;
    const probe = new THREE.Vector3();
    let previousCell = null;

    for (let distance = 0; distance <= maxDistance; distance += step) {
      probe.copy(origin).addScaledVector(direction, distance);
      const cell = {
        x: Math.floor(probe.x),
        y: Math.floor(probe.y),
        z: Math.floor(probe.z),
      };

      if (previousCell &&
        cell.x === previousCell.x &&
        cell.y === previousCell.y &&
        cell.z === previousCell.z) {
        continue;
      }

      if (getVoxelGlobal(cell.x, cell.y, cell.z) !== BLOCK.AIR) {
        return {
          block: cell,
          previous: previousCell,
        };
      }

      previousCell = cell;
    }

    return null;
  }

  function onCanvasClick() {
    if (!state.pointerLocked) {
      canvas.requestPointerLock();
    }
  }

  function onPointerLockChange() {
    state.pointerLocked = document.pointerLockElement === canvas;
  }

  function onMouseMove(event) {
    if (!state.pointerLocked) {
      return;
    }
    state.yaw -= event.movementX * 0.0025;
    state.pitch -= event.movementY * 0.0025;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch));
  }

  function onMouseDown(event) {
    if (!state.pointerLocked || !state.targetBlock) {
      return;
    }

    if (event.button === 0) {
      updateBlockAt(state.targetBlock.block.x, state.targetBlock.block.y, state.targetBlock.block.z, BLOCK.AIR);
    } else if (event.button === 2 && state.targetBlock.previous) {
      const pos = state.targetBlock.previous;
      if (!intersectsPlayerPlacement(pos.x, pos.y, pos.z)) {
        updateBlockAt(pos.x, pos.y, pos.z, BLOCK.DIRT);
      }
    }
  }

  function intersectsPlayerPlacement(x, y, z) {
    const player = getPlayerAabb();
    return aabbIntersects(player, { min: { x, y, z }, max: { x: x + 1, y: y + 1, z: z + 1 } });
  }

  function updateBlockAt(worldX, worldY, worldZ, block) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return;
    }

    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = ensureChunk(chunkX, chunkZ);
    const localX = mod(worldX, CHUNK_SIZE);
    const localZ = mod(worldZ, CHUNK_SIZE);
    setLocalVoxel(chunk.voxels, localX, worldY, localZ, block);
    rebuildChunkMesh(chunk);

    if (localX === 0) rebuildNeighborChunk(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) rebuildNeighborChunk(chunkX + 1, chunkZ);
    if (localZ === 0) rebuildNeighborChunk(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) rebuildNeighborChunk(chunkX, chunkZ + 1);

    refreshStats();
    updateSelection();
  }

  function rebuildNeighborChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    const chunk = state.chunks.get(key);
    if (chunk) {
      rebuildChunkMesh(chunk);
    }
  }

  function ensureChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    if (!state.chunks.has(key)) {
      const chunk = createChunk(chunkX, chunkZ);
      state.chunks.set(key, chunk);
      rebuildChunkMesh(chunk);
    }
    return state.chunks.get(key);
  }

  function getVoxelGlobal(worldX, worldY, worldZ) {
    if (worldY < 0 || worldY >= WORLD_HEIGHT) {
      return BLOCK.AIR;
    }
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const key = chunkKey(chunkX, chunkZ);
    const chunk = state.chunks.get(key);
    if (!chunk) {
      return BLOCK.AIR;
    }
    return getLocalVoxel(chunk.voxels, mod(worldX, CHUNK_SIZE), worldY, mod(worldZ, CHUNK_SIZE));
  }

  function updateCamera() {
    camera.position.set(state.playerPos.x, state.playerPos.y + EYE_HEIGHT, state.playerPos.z);

    const lookDir = new THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      Math.cos(state.yaw) * Math.cos(state.pitch)
    );

    const lookTarget = camera.position.clone().add(lookDir);
    camera.lookAt(lookTarget);

    crosshair.position.copy(camera.position).add(lookDir.clone().multiplyScalar(1.5));
    crosshair.quaternion.copy(camera.quaternion);
  }

  function refreshStats() {
    let totalFaces = 0;
    let totalTriangles = 0;
    let maxHeight = 0;

    for (const chunk of state.chunks.values()) {
      totalFaces += chunk.visibleFaces || 0;
      totalTriangles += chunk.triangles || 0;
      maxHeight = Math.max(maxHeight, chunk.maxHeight || 0);
    }

    stats.chunkSize.textContent = `${state.chunks.size} chunks`;
    stats.visibleFaces.textContent = String(totalFaces);
    stats.triangles.textContent = String(totalTriangles);
    stats.maxHeight.textContent = String(maxHeight);
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }
  }

  function onKeyDown(event) {
    if (event.code === "KeyR") {
      regenerateWorld();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (state.onGround) {
        state.velocity.y = JUMP_SPEED;
        state.onGround = false;
      }
      return;
    }

    state.keys.add(event.code);
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
  }

  function buildCrosshair() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.035, 0, 0,
           0.035, 0, 0,
           0, -0.035, 0,
           0,  0.035, 0,
        ],
        3
      )
    );
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
  }

  function createTextureAtlas() {
    const tileSize = 32;
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = tileSize * 2;
    atlasCanvas.height = tileSize * 2;
    const ctx = atlasCanvas.getContext("2d");

    paintGrassTop(ctx, 0, 0, tileSize);
    paintDirt(ctx, tileSize, 0, tileSize);
    paintGrassSide(ctx, 0, tileSize, tileSize);
    paintStone(ctx, tileSize, tileSize, tileSize);

    const texture = new THREE.CanvasTexture(atlasCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    return {
      texture,
      uvMap: {
        grassTop: tileRect(0, 0, tileSize, atlasCanvas.width, atlasCanvas.height),
        dirt: tileRect(1, 0, tileSize, atlasCanvas.width, atlasCanvas.height),
        grassSide: tileRect(0, 1, tileSize, atlasCanvas.width, atlasCanvas.height),
        stone: tileRect(1, 1, tileSize, atlasCanvas.width, atlasCanvas.height),
      },
    };
  }

  function tileRect(col, row, size, atlasWidth, atlasHeight) {
    const pad = 0.001;
    const u0 = col * size / atlasWidth + pad;
    const u1 = (col + 1) * size / atlasWidth - pad;
    const v1 = 1 - row * size / atlasHeight - pad;
    const v0 = 1 - (row + 1) * size / atlasHeight + pad;
    return { u0, u1, v0, v1 };
  }

  function paintGrassTop(ctx, x, y, size) {
    ctx.fillStyle = "#5dbb63";
    ctx.fillRect(x, y, size, size);
    for (let i = 0; i < 120; i += 1) {
      const px = x + Math.floor(Math.random() * size);
      const py = y + Math.floor(Math.random() * size);
      ctx.fillStyle = i % 3 === 0 ? "#8fe37a" : "#4c9f52";
      ctx.fillRect(px, py, 2, 2);
    }
  }

  function paintDirt(ctx, x, y, size) {
    ctx.fillStyle = "#8b5a36";
    ctx.fillRect(x, y, size, size);
    for (let i = 0; i < 110; i += 1) {
      const px = x + Math.floor(Math.random() * size);
      const py = y + Math.floor(Math.random() * size);
      ctx.fillStyle = i % 2 === 0 ? "#70452b" : "#a06a3f";
      ctx.fillRect(px, py, 2, 2);
    }
  }

  function paintGrassSide(ctx, x, y, size) {
    ctx.fillStyle = "#8b5a36";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#60bb63";
    ctx.fillRect(x, y, size, size * 0.32);
    for (let i = 0; i < 80; i += 1) {
      const px = x + Math.floor(Math.random() * size);
      const py = y + Math.floor(Math.random() * size * 0.35);
      ctx.fillStyle = i % 2 === 0 ? "#8fe37a" : "#4b9f52";
      ctx.fillRect(px, py, 2, 2);
    }
    for (let i = 0; i < 60; i += 1) {
      const px = x + Math.floor(Math.random() * size);
      const py = y + Math.floor(size * 0.35) + Math.floor(Math.random() * size * 0.6);
      ctx.fillStyle = i % 2 === 0 ? "#6e442b" : "#a06a3f";
      ctx.fillRect(px, py, 2, 2);
    }
  }

  function paintStone(ctx, x, y, size) {
    ctx.fillStyle = "#8d98a2";
    ctx.fillRect(x, y, size, size);
    for (let i = 0; i < 120; i += 1) {
      const px = x + Math.floor(Math.random() * size);
      const py = y + Math.floor(Math.random() * size);
      ctx.fillStyle = i % 2 === 0 ? "#717d86" : "#a7b0b7";
      ctx.fillRect(px, py, 2, 2);
    }
  }

  function resolveTileName(blockName, faceTile) {
    if (blockName === "stone") return "stone";
    if (faceTile === "grassTop") return "grassTop";
    if (faceTile === "dirt") return "dirt";
    return "grassSide";
  }

  function getBlockTextureName(block) {
    if (block === BLOCK.STONE) return "stone";
    if (block === BLOCK.DIRT) return "dirt";
    return "grass";
  }

  function setLocalVoxel(voxels, x, y, z, value) {
    voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = value;
  }

  function getLocalVoxel(voxels, x, y, z) {
    if (
      !voxels ||
      x < 0 || x >= CHUNK_SIZE ||
      y < 0 || y >= WORLD_HEIGHT ||
      z < 0 || z >= CHUNK_SIZE
    ) {
      return BLOCK.AIR;
    }
    return voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  function chunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
  }

  function mod(value, size) {
    return ((value % size) + size) % size;
  }

  function random2D(ix, iz) {
    const value = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function valueNoise(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = smoothstep(x - x0);
    const tz = smoothstep(z - z0);

    const n00 = random2D(x0, z0);
    const n10 = random2D(x1, z0);
    const n01 = random2D(x0, z1);
    const n11 = random2D(x1, z1);

    return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), tz);
  }

  function octaveNoise(x, z, octaves, persistence) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i += 1) {
      total += valueNoise(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
})();
