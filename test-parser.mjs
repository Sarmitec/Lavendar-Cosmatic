import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseCSV, rowsToProducts, safeImageUrl, validatePhone } = require("./app.js");

const csv = `id,name,description,price,category,image,badge,active
1,سبلاش,عطور,250,fragrance,,,TRUE`;
const products = rowsToProducts(parseCSV(csv));
console.assert(products.length === 1, "real row should produce one product");
console.assert(products[0].id === "1" && products[0].price === 250 && products[0].category === "fragrance" && products[0].image === "", "real row mapping failed");
console.assert(products[0].active !== false, "active row should be retained");
const warnings = [];
const originalWarn = console.warn;
console.warn = (message) => warnings.push(message);
const typoProducts = rowsToProducts(parseCSV(csv.replace("fragrance", "fragurance")));
console.warn = originalWarn;
console.assert(typoProducts.length === 0 && warnings.some((message) => message.includes('invalid category "fragurance"')), "invalid category should be skipped and warned");
console.assert(parseCSV('\uFEFFid,name\r\n1,"A, B"').length === 1, "BOM and quoted comma failed");
console.assert(parseCSV('id,name,description\r\n1,"سطر\nجديد",x')[0].name === "سطر\nجديد", "quoted newline failed");
console.assert(safeImageUrl("javascript:alert(1)") === "" && safeImageUrl("data:text/plain,x") === "" && safeImageUrl("http://x") === "" && safeImageUrl("//x") === "" && safeImageUrl("../x") === "", "unsafe image URL accepted");
console.assert(validatePhone("05xxxxxxxx") === false && validatePhone("+963998910648") === true, "phone validation failed");
const soldOut = rowsToProducts(parseCSV(`id,name,description,price,category,image,badge,active,soldout
2,منتج,وصف,10,makeup,,,TRUE,TRUE`));
console.assert(soldOut.length === 1 && soldOut[0].soldout === true, "sold-out product failed");
const available = rowsToProducts(parseCSV(`id,name,description,price,category,image,badge,active,soldout
3,منتج,وصف,10,makeup,,,TRUE,FALSE`));
console.assert(available.length === 1 && available[0].soldout === false, "available product failed");
console.log("PASS: real sheet row maps to one active product");
console.log("PASS: misspelled category is skipped with a warning");
console.log("PASS: CSV quoting, BOM, Arabic text, image and phone validation");
console.log("PASS: optional sold-out column");
