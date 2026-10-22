export interface SearchRecipe {
  id: string;
  name: string;
  enabled: boolean;
  target_roles: string[];
  locations: string[];
  min_fit_score: number;
  exclude_keywords: string[];
  sort_order: number;
}

export function emptyRecipe(index = 1): Omit<SearchRecipe, "id"> {
  return {
    name: index === 1 ? "Primary search" : `Search ${index}`,
    enabled: true,
    target_roles: [],
    locations: ["United States"],
    min_fit_score: 82,
    exclude_keywords: [],
    sort_order: index,
  };
}

/** Recipes share one daily cap. Highest fit wins; disabled recipes are ignored. */
export function effectiveRecipeFloor(recipes: SearchRecipe[], fallback: number): number {
  const active = recipes.filter((recipe) => recipe.enabled);
  if (active.length === 0) return fallback;
  return Math.min(...active.map((recipe) => recipe.min_fit_score));
}

export function recipeMatchesTitle(recipe: SearchRecipe, title: string, location: string): boolean {
  if (!recipe.enabled) return false;
  const roleOk = recipe.target_roles.length === 0
    || recipe.target_roles.some((role) => title.toLowerCase().includes(role.toLowerCase()));
  const locOk = recipe.locations.length === 0
    || recipe.locations.some((loc) => {
      const needle = loc.toLowerCase();
      if (needle === "united states" || needle === "us" || needle === "usa") return true;
      return location.toLowerCase().includes(needle);
    });
  return roleOk && locOk;
}
