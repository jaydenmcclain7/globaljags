// Import packages
const getExif = require('exif-async');
const parseDMS = require('parse-dms');
const {Storage} = require('@google-cloud/storage');
const path = require('path');
const os = require('os'); 
const fs = require('fs-extra');
const {Firestore} = require('@google-cloud/firestore');
const { FILE } = require('dns');
const { Console } = require('console');

// Entry Point function
exports.extractExif = async (file, context) => {
  const storage = new Storage();
  const sourceBucket = storage.bucket(file.bucket);

  // This shows me which GCP version of the function is executing
  const version = process.env.K_REVISION;
  console.log(`Running Cloud Function version ${version}`);

  // Create a working directory on the VM that runs our GCF to download the original file
  // The value of this variable will be something like 'tmp/exif'
  const workingDir = path.join(os.tmpdir(), 'exif');
  // Create a variable that holds the path to the 'local' version of the file
  // The value of this will be something like 'tmp/exif/thumb@64_398575858493.png'
  const tempFilePath = path.join(workingDir, file.name);
  console.log(`File Name: ${file.name}` );
  // Wait until the working directory is ready
  await fs.ensureDir(workingDir);
  // Download the original file to the path on the 'local' VM
  await sourceBucket.file(file.name).download({
    destination: tempFilePath
  });
  // Ensure the file is downloaded to the 'local' VM
  console.log(tempFilePath);
  // Pass the LOCAL file to our readExifData function
  // This will return an object with information about the CreateDate, latitude, and longitude of the photo
  let gpsObject = await readExifData(tempFilePath);
  console.log(gpsObject);
  let coordinates = getGPSCoordinates(gpsObject);
  let dataObject = {};
  dataObject.lat = coordinates.lat;
  dataObject.lon = coordinates.lon;
  dataObject.createDate = new Date();
  
  // Create variables that hold the HTTP URLs to the different versions of the photo
  let finalURL = `https://storage.googleapis.com/sp24-41200-jaydmccl-gj-final/${file.name}`;
  let thumbNailURL = `https://storage.googleapis.com/sp24-41200-jaydmccl-gj-thumbnails/thumb@64_${file.name}`;
  // Update the dataObject to add links to the image
  dataObject.finalURL = finalURL;
  dataObject.thumbNailURL = thumbNailURL;
  // Write the dataObject to a Firestore document
  const firestore = new Firestore({
    projectId : "sp24-41200-jaydmccl-globaljags"
  });
  let collectionRef = firestore.collection('photos');
  let documentRef = await collectionRef.add(dataObject);
  console.log(`Document created : ${documentRef.id}`);
  // Delete the temp working directory and its files from the GCF's VM
  await fs.remove(workingDir);
};

// Helper functions
async function readExifData(localFile) {
  // Use the exif-async package to read the EXIF data
 
    // Create an object that will hold the pertient EXIF elements

    // If EXIF data exists, add it to the dataObject
    try {
        let exifData = await getExif(localFile);
        // console.log(exifData);
        // console.log(exifData.gps);
        console.log(exifData.gps.GPSLatitude);
        return exifData.gps;
    } catch(err) {
        console.log(err);
        return null;
    }
}

function getGPSCoordinates(g) {
  // PARSE DMS needs a string in the format of:
  // 51:30:0.5486N 0:7:34.4503W
  // DEG:MIN:SECDIRECTION DEG:MIN:SECDIRECTION
  console.log(g);
  const latString = `${g.GPSLatitude[0]}:${g.GPSLatitude[1]}:${g.GPSLatitude[2]}${g.GPSLatitudeRef}`;
  const lonString = `${g.GPSLongitude[0]}:${g.GPSLongitude[1]}:${g.GPSLongitude[2]}${g.GPSLongitudeRef}`;

  const degCoords = parseDMS(`${latString} ${lonString}`);

  return degCoords;
}