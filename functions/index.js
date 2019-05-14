/* eslint-disable promise/always-return */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firebase = admin.initializeApp();
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs-extra");
exports.resizeImage = functions.storage.object().onFinalize(async object => {
  const bucket = firebase.storage().bucket();
  const filePath = object.name;
  const fileName = filePath.split("/").pop();
  const bucketDir = path.dirname(filePath);
  const workingDir = path.join(os.tmpdir(), "resized");
  const tmpFilePath = path.join(workingDir, "source");
  //I suspect that this is downloading the file to somewhere other than workingDir
  //and then the program is using it, somehow
  // bucket.file(filePath).getMetadata().then(data => {
  //   fileSize = data[0].size;
  // }).catch(err => console.log(err))

  if (fileName.includes("resizedTo") || !object.contentType.includes("image")) {
    console.log("exiting function");
    return false;
  } else if (object.size < 200000) {
    console.log("file size is small enough")
    return false;
  }

  // 1. Ensure thumbnail dir exists
  await fs.ensureDir(workingDir);
  // 2. Download Source File
  await bucket.file(filePath).download({
    destination: tmpFilePath
  })

  // 3. Resize the images and define an array of upload promises
  let sizes = []; //dimensions are pushed to array
  const imgDimensions = sharp(tmpFilePath);
  await imgDimensions.metadata()
    .then(metadata => {
      let widthHeightArr = [0, 0];
      widthHeightArr[0] = Math.round(metadata.width / 5);
      widthHeightArr[1] = Math.round(metadata.height / 5);
      sizes.push(widthHeightArr);
      sizes.push([null, 64]) //height of thumbnail
    })
    .catch(() => "obligatory catch");
    const uploadPromises = sizes.map(async size => {
      //using the date to give a unique name to each file
      var d = new Date();
      var y = d.getFullYear().toString();
      y = y.slice(2, 4)
      var m = (d.getMonth() + 1).toString();
      if (m.length === 1) {
        m = "0" + m
      }
      var n = d.getDate().toString();
      var dayMark = y + m + n;
    const thumbName = `resizedTo${size}on${dayMark}${fileName}`;
    let thumbPath = path.join(workingDir, thumbName);
    
    
    // Resize source image
      await sharp(tmpFilePath).jpeg({
        quality: 100,
        chromaSubsampling: '4:4:4'
      })
        .resize(size[0], size[1])
        .toFile(thumbPath);
    
    // Upload to firebase storage
    await bucket.upload(thumbPath, {
      destination: path.join(bucketDir, thumbName)
    });



  });
  
await Promise.all(uploadPromises);
  // 6. Cleanup remove the tmp/thumbs from the filesystem

  fs.emptyDirSync(workingDir);
  fs.rmdirSync(workingDir);

  //delete original upload
  bucket
    .file(fileName)
    .delete()
    .catch(err => console.log("delete didn't work", err));


});
//# sourceMappingURL=index.js.map
