let tmxStore = localforage.createInstance({
  name: "tmx"
});

let indexStore = localforage.createInstance({
  name: "index"
});

let currentFileName = "";
let tuList = [];
let documentIndex = undefined;

document.addEventListener("DOMContentLoaded",function(){
  registerEvents();
  loadFilesList();
  switchPage(0);
})


function registerEvents(){
  document.getElementsByClassName("add-button")[0].addEventListener("click",function(){
    saveToIndexedDB();
  })
  document.getElementsByClassName("back-button")[0].addEventListener("click",function(){
    switchPage(0);
  })
  document.getElementsByClassName("search-button")[0].addEventListener("click",function(){
    search();
  })
}

function saveToIndexedDB(){
  let files = document.getElementById('file').files;
  if (files.length == 0) {
    return;
  }
  let file = files[0];
  let fileReader = new FileReader();
  fileReader.onload = async function(e){
    await tmxStore.setItem(file.name,e.target.result);
    loadFilesList();
    //createIndex(e.target.result,file.name);
  };
  fileReader.onerror = function () {
    console.warn('oops, something went wrong.');
  };
  fileReader.readAsText(file);
}

async function loadFilesList(){
  const keys = await tmxStore.keys();
  const filesList = document.getElementsByClassName("files-list")[0];
  filesList.innerHTML = "";
  for (const key of keys) {
    console.log(key);
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href="javascript:void(0);";
    link.innerText = key;
    link.addEventListener("click",function(){
      const newURL = window.location.origin + window.location.pathname + "?filename=" + encodeURIComponent(currentFileName);
      if (newURL != window.location.href) {
        history.pushState(null, null, newURL);
      }
      switchPage(1);
      createIndexIfNeeded(key);
    })
    item.appendChild(link);
    filesList.appendChild(item);
  }
}

function switchPage(index) {
  if (index === 0) {
    document.getElementsByClassName("home")[0].style.display = "";
    document.getElementsByClassName("search")[0].style.display = "none";
    document.getElementsByClassName("back-button")[0].style.display = "none";
  }else{
    document.getElementsByClassName("home")[0].style.display = "none";
    document.getElementsByClassName("search")[0].style.display = "";
    document.getElementsByClassName("back-button")[0].style.display = "";
  }
}

async function createIndexIfNeeded(name){
  if (currentFileName != name) {
    let xml = await tmxStore.getItem(name);
    updateStatus("解析XML中……");
    await sleep(100);
    tuList = await parseXML(xml,name);
    updateStatus("建立索引中……");
    await sleep(100);
    createIndex();
    updateStatus("");
    currentFileName = name;
  }
}

function sleep(ms) {
  return new Promise(function (resolve, reject) {
    setTimeout(function(){
      resolve();
    },ms)
  });
}

function parseXML(xml){
  return new Promise(function (resolve, reject) {
    let parser = sax.parser();
    let transUnits = [];
    let tu = {};
    let tuStart = false;
    let tagName = "";
    let lang = "";
    let index = 0;
    parser.onerror = function (e) {
      // an error happened.
      console.log(e);
      reject(e);
    };
    parser.ontext = function (t) {
      // got some text.  t is the string of text.
      if (tuStart && tagName && t.trim()) {
        if (tagName === "SEG") {
          tu[lang] = t;
        }
        if (tagName === "NOTE") {
          tu[tagName] = t;
        }
      }
    };
    parser.onopentag = function (node) {
      // opened a tag.  node has "name" and "attributes"
      if (node.name === "TU") {
        if (tuStart) {
          transUnits.push(tu);
          index = index + 1;
          tu = {}; 
        }
        tuStart = true;
      }
      if (node.name === "TUV") {
        lang = node.attributes["XML:LANG"] ?? node.attributes["LANG"];
      }
      if (node.name === "NOTE" || node.name === "SEG") {
        tagName = node.name;
      }else{
        tagName = "";
      }
    };
    parser.onattribute = function (attr) {
      // an attribute.  attr has "name" and "value"
    };
    parser.onend = function () {
      // parser stream is done, and ready to have more stuff written to it.
      if (Object.keys(tu).length>0) {
        transUnits.push(tu);
        index = index + 1;
      }
      resolve(transUnits);
    };
    parser.write(xml).close();
  });
}

function createIndex(){
  if (tuList.length>0) {
    let keys = Object.keys(tuList[0]);
    loadSelectOptions(keys);
    documentIndex = new FlexSearch.Document({
      document: {
          id: "id",
          index: createIndexConfiguration(keys)
      }
    });
    for (let index = 0; index < tuList.length; index++) {
      const tu = tuList[index];
      documentIndex.add(index,tu);
    }
  }
}

function createIndexConfiguration(keys){
  let configs = []
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const config = {
      field: key,
      tokenize: "forward",
      encode: str => str.replace(/[:"“”：]/g, " ").replace(/\n/g, " ").replace(/([\u4e00-\u9fa5])/g, " $1 ").split(" ")
    }
    configs.push(config)
  }
  return configs;
}

function loadSelectOptions(keys){
  let select = document.getElementsByClassName("field-select")[0];
  for (let index = select.childNodes.length -1 ; index >= 0; index--) {
    const node = select.childNodes[index];
    if (index > 1) {
      select.removeChild(node)
    }
  }
  for (const key of keys) {
    let option = document.createElement("option");
    option.value = key;
    option.innerText = key;
    select.appendChild(option);
  }
}

function updateStatus(status){
  document.getElementsByClassName("status")[0].innerText = status;
}

function search(){
  const container = document.getElementsByClassName("search-results")[0];
  container.innerHTML = "";
  let keywords = document.getElementsByClassName("keywords")[0].value;
  let fields = createSearchFields();
  let results = documentIndex.search(keywords,fields);
  let count = 0;
  for (let i = 0; i < results.length; i++) {
    const fieldResult = results[i];
    for (let j = 0; j < fieldResult.result.length; j++) {
      const resultIndex = fieldResult.result[j];
      count = count + 1;
      const item = buildSearchResultItem(count,resultIndex,tuList[resultIndex]);
      container.appendChild(item);
    }
  }
  const newURL = window.location.origin + window.location.pathname + "?filename=" + encodeURIComponent(currentFileName) + "&keywords=" + encodeURIComponent(keywords);
  if (newURL != window.location.href) {
    history.pushState(null, null, newURL);
  }
}

function buildSearchResultItem(count,resultIndex,tu){
  const container = document.createElement("div");
  const title = document.createElement("h3");
  const link = document.createElement("a");
  link.href = "";
  link.innerText = count;
  title.appendChild(link);
  const text = document.createElement("div");
  const highlights = document.createElement("p");
  highlights.innerHTML = getHighlights(getContent(tu));
  text.appendChild(highlights);
  container.appendChild(title);
  container.appendChild(text);
  return container;
}

function getContent(tu){
  let content = "";
  const keys = Object.keys(tu);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    content = content + key.toLowerCase() + ": " + tu[key];
    if (index < keys.length - 1) {
      content = content + "<br/>";
    }
  }
  return content;
}

function getHighlights(content){
  const keywords = document.getElementsByClassName("keywords")[0].value;
  let context = content;
  const regexForContent = new RegExp(keywords, 'gi');
  // Replace content where regex matches
  context = context.replace(regexForContent, "<span class='hightlighted'>$&</span>");
  return context;
}

function createSearchFields(){
  let select = document.getElementsByClassName("field-select")[0];
  let fields = [];
  let options = select.getElementsByTagName("option");
  if (select.selectedIndex === 0) {
    for (let index = 1; index < options.length; index++) {
      const option = options[index];
      fields.push(option.value);
    }
  }else{
    fields.push(select.selectedOptions[0].value);
  }
  return fields;
}