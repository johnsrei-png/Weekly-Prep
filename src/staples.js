// A built-in index of common grocery staples for pantry autocomplete.
// Each entry: [name, defaultUnit, category]. Unit "" means a countable item.
// cat is one of: produce, meat, dairy, bakery, pantry.

export const STAPLES = [
  // ---- Produce ----
  ["apple", "", "produce"], ["avocado", "", "produce"], ["banana", "", "produce"],
  ["basil", "bunch", "produce"], ["bell pepper", "", "produce"], ["blueberries", "pint", "produce"],
  ["broccoli", "head", "produce"], ["cabbage", "head", "produce"], ["carrots", "", "produce"],
  ["cauliflower", "head", "produce"], ["celery", "bunch", "produce"], ["cherry tomatoes", "pint", "produce"],
  ["cilantro", "bunch", "produce"], ["corn", "", "produce"], ["cucumber", "", "produce"],
  ["garlic", "clove", "produce"], ["ginger", "oz", "produce"], ["green beans", "lb", "produce"],
  ["green onion", "", "produce"], ["jalapeno", "", "produce"], ["kale", "bunch", "produce"],
  ["lemon", "", "produce"], ["lettuce", "head", "produce"], ["lime", "", "produce"],
  ["mushrooms", "oz", "produce"], ["onion", "", "produce"], ["orange", "", "produce"],
  ["parsley", "bunch", "produce"], ["pear", "", "produce"], ["peas", "cup", "produce"],
  ["potatoes", "lb", "produce"], ["red onion", "", "produce"], ["red bell pepper", "", "produce"],
  ["romaine", "head", "produce"], ["scallions", "", "produce"], ["shallot", "", "produce"],
  ["snap peas", "cup", "produce"], ["spinach", "cup", "produce"], ["strawberries", "lb", "produce"],
  ["sweet potatoes", "", "produce"], ["tomato", "", "produce"], ["yellow onion", "", "produce"],
  ["zucchini", "", "produce"], ["asparagus", "bunch", "produce"], ["baby carrots", "bag", "produce"],
  ["butternut squash", "lb", "produce"], ["raspberries", "pint", "produce"], ["mango", "", "produce"],
  ["grapes", "lb", "produce"], ["almonds", "oz", "produce"], ["mixed berries", "bag", "produce"],

  // ---- Meat & Seafood ----
  ["chicken breast", "lb", "meat"], ["chicken thighs", "lb", "meat"], ["ground beef", "lb", "meat"],
  ["ground turkey", "lb", "meat"], ["lean ground turkey", "lb", "meat"], ["bacon", "", "meat"],
  ["center-cut bacon", "", "meat"], ["salmon fillet", "lb", "meat"], ["tilapia fillets", "lb", "meat"],
  ["shrimp", "lb", "meat"], ["pork chops", "lb", "meat"], ["steak", "lb", "meat"],
  ["turkey sausage", "oz", "meat"], ["lean turkey sausage", "oz", "meat"], ["italian sausage", "lb", "meat"],
  ["cod", "lb", "meat"], ["tuna", "can", "meat"], ["ham", "lb", "meat"],
  ["ground chicken", "lb", "meat"], ["whole chicken", "", "meat"], ["deli turkey", "lb", "meat"],

  // ---- Dairy & Eggs ----
  ["large eggs", "", "dairy"], ["eggs", "", "dairy"], ["liquid egg whites", "cup", "dairy"],
  ["milk", "cup", "dairy"], ["butter", "tbsp", "dairy"], ["heavy cream", "cup", "dairy"],
  ["plain greek yogurt", "cup", "dairy"], ["greek yogurt", "cup", "dairy"], ["sour cream", "cup", "dairy"],
  ["cheddar cheese", "cup", "dairy"], ["reduced-fat cheddar", "cup", "dairy"], ["mozzarella", "oz", "dairy"],
  ["fresh mozzarella", "oz", "dairy"], ["parmesan", "cup", "dairy"], ["feta cheese", "cup", "dairy"],
  ["cottage cheese", "cup", "dairy"], ["cream cheese", "oz", "dairy"], ["ricotta", "cup", "dairy"],
  ["cream", "cup", "dairy"], ["half and half", "cup", "dairy"], ["swiss cheese", "oz", "dairy"],

  // ---- Bakery ----
  ["whole-grain bread", "", "bakery"], ["bread", "", "bakery"], ["corn tortillas", "", "bakery"],
  ["flour tortillas", "", "bakery"], ["flatbread", "", "bakery"], ["bagels", "", "bakery"],
  ["english muffins", "", "bakery"], ["pita", "", "bakery"], ["hamburger buns", "", "bakery"],
  ["dinner rolls", "", "bakery"], ["naan", "", "bakery"],

  // ---- Pantry & Dry Goods ----
  ["olive oil", "tbsp", "pantry"], ["vegetable oil", "tbsp", "pantry"], ["canola oil", "tbsp", "pantry"],
  ["black beans", "can", "pantry"], ["kidney beans", "can", "pantry"], ["chickpeas", "can", "pantry"],
  ["diced tomatoes", "can", "pantry"], ["tomato sauce", "can", "pantry"], ["tomato paste", "tbsp", "pantry"],
  ["chicken broth", "cup", "pantry"], ["vegetable broth", "cup", "pantry"], ["beef broth", "cup", "pantry"],
  ["white rice", "cup", "pantry"], ["brown rice", "cup", "pantry"], ["jasmine rice", "cup", "pantry"],
  ["quinoa", "cup", "pantry"], ["farro", "cup", "pantry"], ["couscous", "cup", "pantry"],
  ["penne pasta", "lb", "pantry"], ["spaghetti", "lb", "pantry"], ["fusilli pasta", "lb", "pantry"],
  ["pasta", "lb", "pantry"], ["breadcrumbs", "cup", "pantry"], ["whole-grain breadcrumbs", "cup", "pantry"],
  ["flour", "cup", "pantry"], ["sugar", "cup", "pantry"], ["brown sugar", "cup", "pantry"],
  ["honey", "tbsp", "pantry"], ["maple syrup", "tbsp", "pantry"], ["soy sauce", "tbsp", "pantry"],
  ["low-sodium soy sauce", "tbsp", "pantry"], ["balsamic vinegar", "tbsp", "pantry"], ["vinegar", "tbsp", "pantry"],
  ["peanut butter", "tbsp", "pantry"], ["natural peanut butter", "tbsp", "pantry"], ["hummus", "cup", "pantry"],
  ["pesto", "cup", "pantry"], ["salsa", "cup", "pantry"], ["sun-dried tomatoes", "cup", "pantry"],
  ["oats", "cup", "pantry"], ["cereal", "cup", "pantry"], ["granola", "cup", "pantry"],
  ["salt", "tsp", "pantry"], ["black pepper", "tsp", "pantry"], ["garlic powder", "tsp", "pantry"],
  ["onion powder", "tsp", "pantry"], ["paprika", "tsp", "pantry"], ["cumin", "tsp", "pantry"],
  ["chili powder", "tsp", "pantry"], ["cinnamon", "tsp", "pantry"], ["oregano", "tsp", "pantry"],
  ["italian seasoning", "tsp", "pantry"], ["red pepper flakes", "tsp", "pantry"], ["cayenne", "tsp", "pantry"],
  ["curry powder", "tsp", "pantry"], ["turmeric", "tsp", "pantry"], ["bay leaves", "", "pantry"],
  ["vanilla extract", "tsp", "pantry"], ["baking soda", "tsp", "pantry"], ["baking powder", "tsp", "pantry"],
  ["coconut milk", "can", "pantry"], ["almond milk", "cup", "pantry"], ["sesame oil", "tbsp", "pantry"],
  ["sesame seeds", "tbsp", "pantry"], ["cornstarch", "tbsp", "pantry"], ["dijon mustard", "tbsp", "pantry"],
  ["ketchup", "tbsp", "pantry"], ["mayonnaise", "tbsp", "pantry"], ["worcestershire sauce", "tbsp", "pantry"],
  ["hot sauce", "tsp", "pantry"], ["lentils", "cup", "pantry"], ["walnuts", "oz", "pantry"],
  ["cashews", "oz", "pantry"], ["peanuts", "oz", "pantry"], ["raisins", "cup", "pantry"],
  ["chia seeds", "tbsp", "pantry"], ["flax seeds", "tbsp", "pantry"], ["protein powder", "scoop", "pantry"],
];

// Build a quick lookup from item name -> {unit, cat}
export const STAPLE_INDEX = Object.fromEntries(
  STAPLES.map(([name, unit, cat]) => [name.toLowerCase(), { unit, cat }])
);
