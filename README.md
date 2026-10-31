# Lavendar

## إعداد Google Sheet

أنشئي جدول Google Sheet بالأعمدة التالية وبالترتيب التالي:

`id,name,description,price,category,image,badge,active`

يمكن إضافة عمود اختياري باسم `soldout`. إذا كانت قيمته `TRUE` أو `true` أو `1` أو `yes` أو `نعم` يظهر المنتج كنافد المخزون ولا يمكن إضافته إلى السلة.

- قيم `category` المسموح بها: `makeup` و`fragrance` و`skincare`.
- تكون المنتجات ظاهرة عندما تكون `active` فارغة أو `TRUE` أو `true` أو `1` أو `yes` أو `نعم`.
- استخدمي اسم ملف صورة في الجذر مثل `product.jpg` أو رابط HTTPS من المضيفين المسموحين للصور.
- من Google Sheets اختاري **File > Share > Publish to web**، ثم اختاري الورقة وCSV وانسخي رابط النشر. لا تستخدمي رابط التعديل.
- ضعي رابط CSV المنشور في [app.js](./app.js)، في القسم 1 `CONFIG`، داخل `SHEET_CSV_URL` فقط.
- قد يستغرق تحديث النشر نحو خمس دقائق.

## النشر

يمكن نشر الملفات الثابتة على Netlify أو Cloudflare Pages. ارفعي ملفات جذر المشروع كما هي.

## قائمة الأمان

- فعّلي التحقق بخطوتين لحساب Google وحساب Netlify أو Cloudflare.
- اجعلي مشاركة الجدول **Restricted**.
- لا تمنحي أشخاصاً غير موثوقين صلاحية Editor.
- لا تضعي بيانات خاصة أو شخصية في الجدول.
