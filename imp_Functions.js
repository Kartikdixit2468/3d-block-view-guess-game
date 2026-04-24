/**
 * logic.js
 * Contains the procedural generation logic for 3D shapes and their 2D orthographic views.
 * Fully compatible with the 2D Canvas rendering engine in index.html.
 */

// --- HELPER FUNCTIONS ---

/**
 * Rounds values to 2 decimal places to avoid floating point errors
 */
function round2(val) { 
    return Math.round(val * 100) / 100; 
}

/**
 * Normalizes and centers a list of 2D shapes around the coordinate (0,0)
 */
function centerShapes2D(shapes) {
    if (!shapes || shapes.length === 0) return shapes;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    shapes.forEach(s => {
        let hw = 0, hh = 0;
        if (s.type === 'rect') { hw = s.w/2; hh = s.h/2; }
        else if (s.type === 'circle' || s.type === 'coneTop') { hw = s.r; hh = s.r; }
        else if (s.type === 'triangle') { hw = s.w/2; hh = s.h/2; }
        else if (s.type === 'pyramidTop') { hw = s.w/2; hh = s.w/2; }
        
        minX = Math.min(minX, s.x - hw);
        maxX = Math.max(maxX, s.x + hw);
        minY = Math.min(minY, s.y - hh);
        maxY = Math.max(maxY, s.y + hh);
    });
    
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2;
    
    return shapes.map(s => {
        let out = { ...s, x: round2(s.x - cx), y: round2(s.y - cy) };
        if (out.w !== undefined) out.w = round2(out.w);
        if (out.h !== undefined) out.h = round2(out.h);
        if (out.r !== undefined) out.r = round2(out.r);
        return out;
    });
}


// --- MAIN FUNCTIONS ---

/**
 * Generates an array of `n` random 3D structures.
 * Ensures the structure is connected (contiguous) by building off adjacent faces.
 * * @param {number} n - Number of structures to generate
 * @param {string[]} allowedShapes - e.g. ['cube', 'cuboid', 'prism', 'pramid', 'cone']
 * @returns {Array} Array of shape objects (each containing an array of elements)
 */
function generateRandomShapesData(n, allowedShapes = ['cube']) {
    const data = [];
    
    // Normalize user inputs (e.g., fix typos like 'pramid')
    const shapes = allowedShapes.map(s => s.toLowerCase() === 'pramid' ? 'pyramid' : s.toLowerCase());
    
    for (let i = 0; i < n; i++) {
        const elements = [];
        const occupied = new Set();
        const getKey = (x, y, z) => `${x},${y},${z}`;
        
        // Start the structure with a base cube at the origin
        elements.push({ type: 'cube', pos: [0, 0, 0] });
        occupied.add(getKey(0, 0, 0));
        
        // Allowed positions to attach the next blocks (Frontier)
        let frontier = [
            [1,0,0], [-1,0,0], [0,1,0], [0,0,1], [0,0,-1]
        ];
        
        // Randomize how many pieces form this structure (between 4 to 8 blocks)
        const numBlocks = Math.floor(Math.random() * 5) + 4; 
        
        for (let j = 0; j < numBlocks; j++) {
            if (frontier.length === 0) break;
            
            // Pick a random frontier position to build upon
            const fIndex = Math.floor(Math.random() * frontier.length);
            const [x, y, z] = frontier.splice(fIndex, 1)[0];
            
            let type = 'cube';
            let size = [1, 1, 1];
            
            // 30% chance to place a non-cube shape if allowed, 
            // but ONLY if we are building upwards or capping a structure.
            if (shapes.length > 1 && Math.random() > 0.7) {
                const nonCubeShapes = shapes.filter(s => s !== 'cube' && s !== 'cuboid');
                if (nonCubeShapes.length > 0) {
                    type = nonCubeShapes[Math.floor(Math.random() * nonCubeShapes.length)];
                }
            }

            // If cuboid is allowed, randomly decide to stretch it
            if (shapes.includes('cuboid') && type === 'cube' && Math.random() > 0.5) {
                // Stretch along X or Z axis
                size = Math.random() > 0.5 ? [2, 1, 1] : [1, 1, 2];
            }

            const element = { type, pos: [x, y, z] };
            if (size[0] !== 1 || size[1] !== 1 || size[2] !== 1) {
                element.size = size;
            }
            
            elements.push(element);
            occupied.add(getKey(x, y, z));
            
            // Add new neighboring slots to the frontier 
            // (Cones/Pyramids taper off, so we don't let the algorithm build on top of them)
            if (type === 'cube') {
                const neighbors = [
                    [x+1, y, z], [x-1, y, z], [x, y+1, z], [x, y, z+1], [x, y, z-1]
                ];
                for (let nPos of neighbors) {
                    if (!occupied.has(getKey(...nPos))) {
                        frontier.push(nPos);
                    }
                }
            }
        }
        
        // Wrap the elements array in a shape object
        data.push({ elements });
    }
    
    return data;
}


/**
 * Core mathematical engine to flatten 3D coordinates into a 2D View.
 * Includes support for Cubes, Cuboids, Cylinders, Cones, Pyramids, and Prisms.
 */
function _generateOrthographicView(elements, type) {
    let shapes = [];
    
    // Depth sorting (Z-buffer equivalent) to handle overlapping shapes
    let sortedElements = [...elements].sort((a, b) => {
        if (type === 'front') return a.pos[2] - b.pos[2]; // Sort Z asc
        if (type === 'top') return a.pos[1] - b.pos[1];   // Sort Y asc
        if (type === 'sideRight') return a.pos[0] - b.pos[0];  // Sort X asc
        if (type === 'sideLeft') return b.pos[0] - a.pos[0]; // Sort X desc
        return 0;
    });

    sortedElements.forEach(el => {
        let t = el.type || 'cube';
        let [x, y, z] = el.pos;
        let u, v;

        // Account for custom sizes (Cuboids)
        let w = el.size ? el.size[0] : 1;
        let h = el.size ? el.size[1] : 1;
        let d = el.size ? el.size[2] : 1;
        
        let r = el.radius || 0.5;
        let ht = el.height || 1;

        // 3D space to 2D screen map
        if (type === 'front') { u = x; v = -y; }
        else if (type === 'top') { u = x; v = z; }
        else if (type === 'sideRight') { u = -z; v = -y; }
        else if (type === 'sideLeft') { u = z; v = -y; }

        // Render 2D Blueprints based on shape and perspective
        if (t === 'cube' || t === 'cuboid') {
            if (type === 'top') shapes.push({type: 'rect', x: u, y: v, w: w, h: d});
            else if (type === 'front') shapes.push({type: 'rect', x: u, y: v, w: w, h: h});
            else shapes.push({type: 'rect', x: u, y: v, w: d, h: h}); // Sides
        } 
        else if (t === 'cylinder') {
            if (type === 'top') shapes.push({type: 'circle', x: u, y: v, r: r});
            else shapes.push({type: 'rect', x: u, y: v, w: r*2, h: ht});
        } 
        else if (t === 'cone') {
            if (type === 'top') shapes.push({type: 'coneTop', x: u, y: v, r: r});
            else shapes.push({type: 'triangle', x: u, y: v, w: r*2, h: ht});
        } 
        else if (t === 'pyramid' || t === 'pramid') {
            let pw = r * Math.SQRT2; 
            if (type === 'top') shapes.push({type: 'pyramidTop', x: u, y: v, w: pw});
            else shapes.push({type: 'triangle', x: u, y: v, w: pw, h: ht});
        }
        else if (t === 'prism') {
            // Triangular prism (tent shape)
            if (type === 'front') shapes.push({type: 'triangle', x: u, y: v, w: w, h: h});
            else if (type === 'top') {
                // Viewed from top, a prism looks like two rectangles joined at the ridge
                shapes.push({type: 'rect', x: u, y: v - d/4, w: w, h: d/2});
                shapes.push({type: 'rect', x: u, y: v + d/4, w: w, h: d/2});
            }
            else shapes.push({type: 'rect', x: u, y: v, w: d, h: h}); // Sides look like flat walls
        }
    });

    return centerShapes2D(shapes);
}

/**
 * Takes a single 3D shape object and generates all 4 orthogonal views for the game options.
 * * @param {Object} shapeObject - A single shape object containing an 'elements' array
 * @returns {Object} Containing the 4 generated 2D views
 */
function getModelViews(shapeObject) {
    // Allows the user to pass either the wrapper object or the elements array directly
    const elements = shapeObject.elements ? shapeObject.elements : shapeObject;
    
    return {
        frontView: _generateOrthographicView(elements, 'front'),
        sideRightView: _generateOrthographicView(elements, 'sideRight'),
        sideLeftView: _generateOrthographicView(elements, 'sideLeft'),
        topView: _generateOrthographicView(elements, 'top')
    };
}

// Ensure functions are available globally if loaded via <script> tag
if (typeof window !== 'undefined') {
    window.generateRandomShapesData = generateRandomShapesData;
    window.getModelViews = getModelViews;
}






