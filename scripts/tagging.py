"""Conservative, explainable keyword tags for the menu prototype."""

from __future__ import annotations

import re
from typing import Any


TASTE_ORDER = ["酸", "甜", "苦", "辣", "麻"]
FORM_ORDER = ["米饭", "面食/粉", "汤羹", "粥", "点心", "饺子馄饨", "烧烤", "热菜", "套餐", "小吃", "其他"]
MEAL_ORDER = ["早餐", "午餐", "晚餐"]

TASTE_WORDS = {
    "酸": re.compile(r"酸|醋|柠檬|泡菜"),
    "甜": re.compile(r"甜|糖|蜜汁|酒酿|豆沙|奶黄|果酱|红豆"),
    "苦": re.compile(r"苦瓜"),
    "辣": re.compile(r"辣|剁椒|泡椒|香辣|麻辣|椒麻|藤椒"),
    "麻": re.compile(r"麻辣|椒麻|藤椒|花椒"),
}

NOODLE_WORDS = re.compile(
    r"面条|拌面|炒面|拉面|刀削面|烩面|炸酱面|牛肉面|汤面|焖面|油泼面|蒸面|重庆小面|"
    r"米线|米粉|酸辣粉|河粉|粉丝|粉条|土豆粉|凉皮|面皮|擀面皮|泡馍|肉夹馍|饸饹"
)
RICE_WORDS = re.compile(r"饭|米饭|炒饭|盖饭|拌饭|饭团")
SOUP_WORDS = re.compile(r"汤|羹|炖盅|豆腐脑")
DUMPLING_WORDS = re.compile(r"饺|馄饨|云吞")
BARBECUE_WORDS = re.compile(r"烧烤|烤|串")
HOT_DISH_WORDS = re.compile(r"炒|红烧|清蒸|蒸|炖|煮|煎|炸|焖|烩|凉拌")
PASTRY_WORDS = re.compile(r"包子|肉包|菜包|大包|小笼包|面包|饼|馒头|烧麦|烧卖|油条|麻球|蛋挞|发糕|糕|酥|春卷|生煎")


def infer_tags(item: dict[str, Any]) -> tuple[list[str], list[str]]:
    name = str(item.get("name", ""))
    category = str(item.get("category", ""))
    haystack = f"{name} {category}"

    tastes = [tag for tag in TASTE_ORDER if TASTE_WORDS[tag].search(name)]
    forms: set[str] = set()
    if RICE_WORDS.search(name) or "铁板饭" in category:
        forms.add("米饭")
    if NOODLE_WORDS.search(name) or name.endswith(("面", "粉", "米线", "米粉")) or any(word in category for word in ("面条", "面食", "米线", "小面", "蒸面")):
        forms.add("面食/粉")
    if SOUP_WORDS.search(name) or "牛肉汤" in category:
        forms.add("汤羹")
    if "粥" in name or "粥" in category:
        forms.add("粥")
    if DUMPLING_WORDS.search(name) or "馄饨水饺" in category:
        forms.add("饺子馄饨")
    if "套餐" in haystack:
        forms.add("套餐")
    if "烧烤" in category or BARBECUE_WORDS.search(name):
        forms.add("烧烤")
    if any(word in category for word in ("点心", "面点")) or PASTRY_WORDS.search(name):
        forms.add("点心")
    explicit_hot_category = any(word in category for word in ("炒菜", "午餐、晚餐", "快餐", "特色"))
    if explicit_hot_category or (HOT_DISH_WORDS.search(name) and not forms.intersection({"点心", "饺子馄饨"})):
        forms.add("热菜")
    if "小吃" in category:
        forms.add("小吃")
    if not forms:
        forms.add("其他")

    return tastes, [tag for tag in FORM_ORDER if tag in forms]


def infer_meal_tags(item: dict[str, Any]) -> list[str]:
    """Use only meal periods explicitly named by the source worksheet/category."""
    category = str(item.get("category", ""))
    meals: set[str] = set()
    if "早餐" in category:
        meals.add("早餐")
    if "午餐" in category:
        meals.add("午餐")
    if "晚餐" in category:
        meals.add("晚餐")
    return [meal for meal in MEAL_ORDER if meal in meals]


def apply_tags(item: dict[str, Any], overrides: dict[str, Any]) -> None:
    inferred_tastes, inferred_forms = infer_tags(item)
    inferred_meals = infer_meal_tags(item)
    override = overrides.get(item["id"])
    if isinstance(override, dict):
        tastes = override.get("tasteTags", inferred_tastes)
        forms = override.get("formTags", inferred_forms)
        meals = override.get("mealTags", inferred_meals)
        item["tasteTags"] = [tag for tag in TASTE_ORDER if tag in tastes]
        item["formTags"] = [tag for tag in FORM_ORDER if tag in forms]
        item["mealTags"] = [tag for tag in MEAL_ORDER if tag in meals]
        item["tagSource"] = "人工复核"
    else:
        item["tasteTags"] = inferred_tastes
        item["formTags"] = inferred_forms
        item["mealTags"] = inferred_meals
        item["tagSource"] = "菜名规则初标"
    item["tasteStatus"] = "待判断" if not item["tasteTags"] else "已初标"
    item["mealStatus"] = "待确认" if not item["mealTags"] else "工作表标注"
