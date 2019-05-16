/* eslint-disable promise/always-return */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const serviceAccount = require("./image-resizer-js-50d77f167cdf.json"); //need this for running without authentication and authorization, specifically for the getSignedUrl part
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://image-resizer-js.firebaseio.com"
});
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs-extra");
exports.resizeImage = functions.storage.object().onFinalize(async object => {
  const bucket = admin.storage().bucket(object.bucket);
  const filePath = object.name;
  const fileName = filePath.split("/").pop();
  const bucketDir = path.dirname(filePath);
  const workingDir = path.join(os.tmpdir(), fileName);//makes individual name for each folder
  const tmpFilePath = path.join(workingDir, `tmp${fileName}`);// and temp file so the files do not get mixed up

  if (fileName.includes("resizedTo") || !object.contentType.includes("image")) {
    console.log("exiting function");
    return false;
  } else if (object.size < 200000) {
    console.log("file size is small enough");
    return false;
  }

  // 1. Ensure thumbnail dir exists
  await fs.ensureDir(workingDir);
  // 2. Download Source File
  await bucket.file(filePath).download({
    destination: tmpFilePath
  });

  // 3. Resize the images and define an array of upload promises
  let sizes = []; //dimensions are pushed to array
  const imgDimensions = await sharp(tmpFilePath);
  await imgDimensions
    .metadata()
    .then(metadata => {
      let widthHeightArr = [0, 0];
      widthHeightArr[0] = Math.round(metadata.width / 5);// change divisor to adjust the dimensions
      widthHeightArr[1] = Math.round(metadata.height / 5);//same for this line
      sizes.push(widthHeightArr);
      sizes.push([null, 64]); //height of thumbnail
    })
    .catch(() => "obligatory catch");

  const uploadPromises = sizes.map(async size => {
    //using the date to give a unique name to each file
    var d = new Date();
    var y = d.getFullYear().toString();
    y = y.slice(2, 4);
    var m = (d.getMonth() + 1).toString();
    if (m.length === 1) {
      m = "0" + m;
    }
    var n = d.getDate().toString();
    if (n.length === 1) {
      n = "0" + n;
    }
    var dayMark = y + m + n;
    const thumbName = `resizedTo${size}on${dayMark}${fileName}`;
    let thumbPath = path.join(workingDir, thumbName);

    // Resize source image
    await sharp(tmpFilePath)
      .jpeg({
        quality: 90, //change this value to adjust quality/size of result
        chromaSubsampling: "4:4:4"
      })
      .resize(size[0], size[1])
      .toFile(thumbPath);

    let tmpFiles = fs.readdirSync(workingDir);
    console.log("TCL: tmpFiles", tmpFiles);

    // Upload to firebase storage
    await bucket.upload(thumbPath, {
      destination: path.join(bucketDir, thumbName)
    });

    const config = {
      action: "read",
      expires: "03-01-2500"
    };
    const results = await Promise.all([
      bucket.file(thumbName).getSignedUrl(config) 
    ]);
    const thumbResult = results[0][0];
    // Add the URLs to the Database
    await admin
      .database()
      .ref("images/")//make sure you have a database set up with an images object/file or whatever they're called
      .push({ path: thumbResult, name: thumbName }); 
    return console.log("Thumbnail URLs saved to database.");
  });

  await Promise.all(uploadPromises);
  // 6. Cleanup remove the tmp/thumbs from the filesystem

  fs.emptyDirSync(workingDir);
  fs.rmdirSync(workingDir);//does the deletion magic

if (fs.existsSync(workingDir)){//I'm using this to check if it has been deleted. I probably don't need it anymore
  let tmpFilesDir = fs.readdirSync(workingDir);
  console.log("TCL: tmpFiles", tmpFilesDir);
} else {
  console.log("workingDir deleted")
}
  //delete original upload
  bucket
    .file(fileName)
    .delete()
    .catch(err => console.log("delete didn't work", err));

  return console.log("image resizing complete!");
});
//# sourceMappingURL=index.js.map
