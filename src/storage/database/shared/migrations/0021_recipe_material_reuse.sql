-- Recipe effect media is a reusable asset.  A material_links tuple is unique,
-- not the material itself, so selecting an already-used video must never make
-- the source binding disappear or reject a same-task recipe save.
CREATE OR REPLACE FUNCTION save_recipe_evaluation(p_command JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipe_id VARCHAR(36) := NULLIF(trim(COALESCE(p_command->>'recipe_id', '')), '');
  v_status VARCHAR(20);
  v_description TEXT;
  v_name VARCHAR(200);
  v_ingredients TEXT;
  v_recipe_type VARCHAR(20);
  v_problem_count INTEGER;
  v_ingredient_items JSONB;
  v_task_id VARCHAR(36);
  v_has_materials BOOLEAN := p_command ? 'material_ids';
  v_material_ids TEXT[] := ARRAY[]::TEXT[];
  v_requested_count INTEGER := 0;
  v_locked_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_recipe JSONB;
  v_materials JSONB;
BEGIN
  IF v_recipe_id IS NULL THEN RAISE EXCEPTION 'recipe not found'; END IF;
  IF v_has_materials AND jsonb_typeof(p_command->'material_ids') <> 'array' THEN
    RAISE EXCEPTION 'material_ids must be an array';
  END IF;

  SELECT r.task_id, r.effect_status, r.effect_description, r.name, r.ingredients,
         r.recipe_type, r.problem_count, r.ingredient_items
  INTO v_task_id, v_status, v_description, v_name, v_ingredients,
       v_recipe_type, v_problem_count, v_ingredient_items
  FROM recipes r WHERE r.id = v_recipe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe not found'; END IF;

  IF p_command ? 'effect_status' THEN v_status := NULLIF(trim(COALESCE(p_command->>'effect_status', '')), ''); END IF;
  IF v_status NOT IN ('qualified', 'unqualified', 'pending') THEN RAISE EXCEPTION 'invalid evaluation status'; END IF;
  IF p_command ? 'effect_description' THEN v_description := p_command->>'effect_description'; END IF;
  IF p_command ? 'name' THEN v_name := p_command->>'name'; END IF;
  IF p_command ? 'ingredients' THEN v_ingredients := p_command->>'ingredients'; END IF;
  IF p_command ? 'recipe_type' THEN v_recipe_type := p_command->>'recipe_type'; END IF;
  IF p_command ? 'problem_count' THEN v_problem_count := (p_command->>'problem_count')::INTEGER; END IF;
  IF p_command ? 'ingredient_items' THEN v_ingredient_items := p_command->'ingredient_items'; END IF;

  IF v_has_materials THEN
    SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::TEXT[])
    INTO v_material_ids FROM jsonb_array_elements_text(p_command->'material_ids');
    v_requested_count := COALESCE(array_length(v_material_ids, 1), 0);
    PERFORM m.id FROM materials m WHERE m.id = ANY(v_material_ids) ORDER BY m.id FOR UPDATE;
    SELECT count(*) INTO v_locked_count FROM materials m WHERE m.id = ANY(v_material_ids);
    IF v_locked_count <> v_requested_count OR EXISTS (
      SELECT 1 FROM materials m
      WHERE m.id = ANY(v_material_ids) AND m.task_id IS DISTINCT FROM v_task_id
    ) THEN RAISE EXCEPTION 'invalid recipe material'; END IF;
  END IF;

  UPDATE recipes
  SET effect_status = v_status, effect_description = v_description, name = v_name,
      ingredients = v_ingredients, recipe_type = v_recipe_type,
      problem_count = v_problem_count, ingredient_items = v_ingredient_items, updated_at = NOW()
  WHERE id = v_recipe_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN RAISE EXCEPTION 'recipe update affected zero rows'; END IF;

  IF v_has_materials THEN
    -- Clear only this target's legacy fallback before material_links becomes
    -- authoritative; every other target binding remains untouched.
    UPDATE materials SET recipe_id = NULL WHERE recipe_id = v_recipe_id;
    DELETE FROM material_links
    WHERE target_type = 'recipe' AND target_id = v_recipe_id
      AND NOT (material_id = ANY(v_material_ids));
    INSERT INTO material_links (material_id, target_type, target_id, binding_method, binding_order)
    SELECT material_id, 'recipe', v_recipe_id, 'click_select', binding_order
    FROM unnest(v_material_ids) WITH ORDINALITY AS selected(material_id, binding_order)
    ON CONFLICT (material_id, target_type, target_id)
    DO UPDATE SET binding_order = EXCLUDED.binding_order,
                  binding_method = EXCLUDED.binding_method,
                  bound_at = NOW(), version = material_links.version + 1;
  END IF;

  SELECT to_jsonb(r) INTO v_recipe FROM recipes r WHERE r.id = v_recipe_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at, m.id), '[]'::jsonb)
  INTO v_materials FROM materials m
  WHERE m.recipe_id = v_recipe_id OR EXISTS (
    SELECT 1 FROM material_links ml
    WHERE ml.material_id = m.id AND ml.target_type = 'recipe' AND ml.target_id = v_recipe_id
  );
  RETURN jsonb_build_object('recipe', v_recipe, 'materials', v_materials);
END;
$$;

REVOKE ALL ON FUNCTION public.save_recipe_evaluation(JSONB) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.save_recipe_evaluation(JSONB) TO service_role;
  END IF;
END $$;
