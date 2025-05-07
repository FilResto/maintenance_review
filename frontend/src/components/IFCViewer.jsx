import React, { useEffect, useRef, useState } from "react";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import { 
  Box, Typography, Paper, List, ListItem, ListItemText, TextField, Divider 
} from "@mui/material";

function IFCViewer({ onObjectSelected, userRole, focusGlobalId }) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const modelRef = useRef(null);
  const [selectedProps, setSelectedProps] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Smoothly focus camera on object by GlobalId
  const focusOnGlobalId = (gid) => {
    if (!gid || !modelRef.current || !worldRef.current) return;
    const world = worldRef.current;
    const model = modelRef.current;

    // Find Express ID for the given GlobalId
    const propsMap = model.getLocalProperties();
    let expressId = null;
    for (const [id, props] of Object.entries(propsMap)) {
      if (props?.GlobalId?.value === gid) {
        expressId = Number(id);
        break;
      }
    }
    if (expressId === null) {
      console.warn("GlobalId not found:", gid);
      return;
    }

    // Find the fragment/mesh for this Express ID
    const fragment = model.items.find((f) => f.ids.has(expressId));
    if (!fragment) {
      console.warn("Object fragment not found (maybe not yet loaded) for GlobalId:", gid);
      return;
    }
    const mesh = fragment.mesh;

    // Compute object's bounding box center and an offset position for the camera
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = bbox.getCenter(new THREE.Vector3());
    if (!center || !isFinite(center.x)) {
      console.warn("Invalid center for object with GlobalId:", gid);
      return;
    }


    // Get camera and controls
    const cam = world.camera.three;
    const controls = world.camera.controls;
    if (!cam) {
      console.warn("Camera not available for focusing.");
      return;
    }
    const size = bbox.getSize(new THREE.Vector3());
    const diagLen = size.length();
    const offsetDist = 2;  // camera stands ~1.5m from object
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    const newCamPos = center.clone().add(camDir.negate().multiplyScalar(offsetDist));
    // If camera controls support setLookAt (e.g., CameraControls), use it for a smooth transition
    if (controls && typeof controls.setLookAt === "function") {
      controls.setLookAt(
        newCamPos.x, newCamPos.y, newCamPos.z,
        center.x, center.y, center.z,
        true  // enable smooth transition
      );
      return; // Camera-controls will handle the tween internally
    }

    // Otherwise, smoothly tween the camera position (and target if orbit controls)
    const startPos = cam.position.clone();
    const startTarget = controls && controls.target 
      ? controls.target.clone() 
      : cam.getWorldDirection(new THREE.Vector3()).add(cam.position.clone());
    const tweenObj = {
      px: startPos.x, py: startPos.y, pz: startPos.z,
      tx: startTarget.x, ty: startTarget.y, tz: startTarget.z
    };
    const targetObj = {
      px: newCamPos.x, py: newCamPos.y, pz: newCamPos.z,
      tx: center.x,    ty: center.y,    tz: center.z
    };

    new TWEEN.Tween(tweenObj)
      .to(targetObj, 1000)  // 1 second animation duration
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate(() => {
        // Update camera position
        cam.position.set(tweenObj.px, tweenObj.py, tweenObj.pz);
        if (controls && controls.target) {
          // Update orbit control target and orient camera toward it
          controls.target.set(tweenObj.tx, tweenObj.ty, tweenObj.tz);
          cam.lookAt(controls.target);
        } else {
          // If no orbit controls, just look at the object center
          cam.lookAt(center);
        }
      })
      .onComplete(() => {
        // Final adjustment to exact target and orientation
        cam.position.copy(newCamPos);
        cam.lookAt(center);
        if (controls && controls.target) {
          controls.target.copy(center);
        }
      })
      .start();

    // Start the tween update loop (if not already running in a render loop)
    function animate(time) {
      if (TWEEN.update(time)) {
        requestAnimationFrame(animate);
      }
    }
    requestAnimationFrame(animate);
  };

  // Trigger camera focus when focusGlobalId prop changes
  useEffect(() => {
    if (focusGlobalId) {
      focusOnGlobalId(focusGlobalId);
    }
  }, [focusGlobalId]);

  // Double-click handler to select an object
  const handleDoubleClick = async (event) => {
    if (!modelRef.current || !worldRef.current) return;
    const world = worldRef.current;

    // Raycast to find clicked object
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), world.camera.three);
    const hits = raycaster.intersectObjects(world.scene.three.children, true);
    if (hits.length === 0) {
      setSelectedProps(null);
      return;
    }
    const mesh = hits[0].object;
    const fragment = modelRef.current.items.find((f) => f.mesh === mesh);
    if (!fragment) {
      setSelectedProps(null);
      return;
    }
    const [expressId] = Array.from(fragment.ids);
    const propsMap = modelRef.current.getLocalProperties();
    const elemProps = propsMap[expressId];
    if (!elemProps) {
      setSelectedProps(null);
      return;
    }
    // Set state to show properties
    setSelectedProps(elemProps);
    // Notify parent of selection (provide GlobalId and click coordinates)
    const globalIdProp = elemProps.GlobalId;
    if (globalIdProp && onObjectSelected) {
      onObjectSelected(globalIdProp.value, event.clientX, event.clientY);
    }
  };

  // Single-click handler to clear selection (hide FloatingAssetPanel)
  const handleSingleClick = () => {
    if (onObjectSelected) {
      onObjectSelected(null);
    }
  };

  // Initialize the IFC scene and load model on first render
  useEffect(() => {
    (async () => {
      const components = new OBC.Components();
      const worlds = components.get(OBC.Worlds);
      worldRef.current = worlds.create();
      const world = worldRef.current;

      // Set up basic scene, renderer, and camera
      world.scene = new OBC.SimpleScene(components);
      world.renderer = new OBC.SimpleRenderer(components, containerRef.current);
      world.camera = new OBC.SimpleCamera(components);

      components.init();           // start the rendering loop
      world.scene.setup();         // add default lights, etc.

      // Load IFC model (with property data)
      const ifcLoader = components.get(OBC.IfcLoader);
      await ifcLoader.setup({ includeProperties: true });
      const response = await fetch("/MyBuildingv5.ifc");
      const data = new Uint8Array(await response.arrayBuffer());
      modelRef.current = await ifcLoader.load(data);
      world.scene.three.add(modelRef.current);

      // Set up event listeners for selection
      containerRef.current.addEventListener("dblclick", handleDoubleClick);
      containerRef.current.addEventListener("click", handleSingleClick);

      // Cleanup on component unmount
      return () => {
        containerRef.current.removeEventListener("dblclick", handleDoubleClick);
        containerRef.current.removeEventListener("click", handleSingleClick);
      };
    })();
  }, []);

  // Filter properties by search query for display
  const filteredProps = selectedProps
    ? Object.entries(selectedProps).filter(([key]) =>
        key.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Render the 3D viewer and property panel (if applicable)
  return (
    <Box sx={{ display: "flex", height: "80vh", width: "100%", bgcolor: "#f5f5f5" }}>
      {/* IFC Viewer Canvas */}
      <Box
        ref={containerRef}
        sx={{
          flex: (userRole === "Admin" || userRole === "Technician") ? 2 : 1,
          border: "1px solid #ccc"
        }}
      />
      {/* Properties Panel (shown for Admin/Technician roles) */}
      {(userRole === "Admin" || userRole === "Technician") && (
        <Paper 
          elevation={3}
          sx={{ flex: 1, p: 2, overflowY: "auto", bgcolor: "white", minWidth: 300 }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>
            Selected Object Properties
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Search Property"
            variant="outlined"
            sx={{ mb: 2 }}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {selectedProps ? (
            <List sx={{ maxHeight: "70vh", overflowY: "auto" }}>
              {filteredProps.length > 0 ? (
                filteredProps.map(([key, value]) => (
                  <React.Fragment key={key}>
                    <ListItem>
                      <ListItemText 
                        primary={key} 
                        secondary={JSON.stringify(value)} 
                      />
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))
              ) : (
                <Typography color="textSecondary">
                  No matching properties.
                </Typography>
              )}
            </List>
          ) : (
            <Typography color="textSecondary">
              Double-click an object to view its properties.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default IFCViewer;
