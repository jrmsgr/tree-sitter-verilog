const PREC = {
  PARENT: 17,     // () [] :: .                                   Left Highest
  UNARY: 16,      // + - ! ~ & ~& | ~| ^ ~^ ^~ ++ -- (unary)
  POW: 15,        // **                                           Left
  MUL: 14,        // * / %                                        Left
  ADD: 13,        // + - (binary)                                 Left
  SHIFT: 12,      // << >> <<< >>>                                Left
  RELATIONAL: 11, // < <= > >= inside dist                        Left
  EQUAL: 10,      // == != === !== ==? !=?                        Left
  AND: 9,         // & (binary)                                   Left
  XOR: 8,         // ^ ~^ ^~ (binary)                             Left
  OR: 7,          // | (binary)                                   Left
  LOGICAL_AND: 6, // &&                                           Left
  LOGICAL_OR: 5,  // ||                                           Left
  CONDITIONAL: -2,// ?: (conditional operator)                    Right
  IMPLICATION: -3,// –> <–>                                       Right
  ASIGN: -4,      // = += -= *= /= %= &= ^= |= <<= >>= <<<= >>>= := :/ <= None
  CONCAT: -5,     // {} {{}}                            Concatenation   Lowest
};

function commaSep(rule) {
  return optional(sep1(',', rule))
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)))
}

function sep1(separator, rule) {
  return prec.left(seq(
    rule,
    repeat(prec.left(seq(separator, rule)))
  ))
}

function psep1(precedence, separator, rule) {
  return prec.left(precedence, seq(
    rule,
    repeat(prec.left(seq(separator, rule)))
  ))
}

function exprOp ($, prior, ops) {
  return prec.left(prior, seq($.expression, token(ops), repeat($.attribute_instance), $.expression));
}

function constExprOp ($, prior, ops) {
  return prec.left(prior, seq($.constant_expression, token(ops), repeat($.attribute_instance), $.constant_expression));
}

function directive (command) {
  return alias(new RegExp('`' + command), 'directive_' + command);
}

/*
    Verilog parser grammar based on IEEE Std 1800-2017.
*/

const rules = {
  source_file: $ => repeat($._description),

  /* 22. Compiler directives */

  /* 22-1 `include */

  include_compiler_directive_relative: $ => seq(
    '"', token.immediate(prec(1, /[^\\"\n]+/)), '"'
  ),

  include_compiler_directive_standard: $ => seq(
    '<', token.immediate(prec(1, /[^\\>\n]+/)), '>'
  ),

  include_compiler_directive: $ => seq(
    directive('include'),
    choice(
      $.include_compiler_directive_relative,
      $.include_compiler_directive_standard
    )
  ),

  /* 22-2 `define */

  default_text: $ => /\w+/,

  macro_text: $ => /[^\n]+/,

  text_macro_name: $ => seq(
    $.text_macro_identifier,
    optional(seq('(', $.list_of_formal_arguments, ')'))
  ),

  list_of_formal_arguments: $ => sep1(',', $.formal_argument),

  formal_argument: $ => seq(
    $.simple_identifier,
    optional(seq('=', $.default_text))
  ),

  text_macro_identifier: $ => $.identifier,

  text_macro_definition: $ => seq(
    directive('define'),
    $.text_macro_name,
    optional($.macro_text),
    '\n'
  ),

  /* 22-3 `usage */

  text_macro_usage: $ => seq(
    '`',
    $.text_macro_identifier,
    optional(seq('(', $.list_of_actual_arguments, ')'))
  ),

  /* 22-4 undef */

  id_directive: $ => seq(
    choice(
      directive('ifdef'),
      directive('ifndef'),
      directive('elsif'),
      directive('undef')
    ),
    $.text_macro_identifier
  ),

  zero_directive: $ => choice(
    directive('resetall'),
    directive('undefineall'),
    directive('endif'),
    directive('else')
  ),

  _directives: $ => choice(
    $.include_compiler_directive,
    $.text_macro_definition,
    $.text_macro_usage,
    $.id_directive,
    $.zero_directive
  ),

  // TODO missing arguments, empty list of arguments

  list_of_actual_arguments: $ => sep1(',', $.actual_argument),

  actual_argument: $ => $.expression,

  /* A.1.1 Library source text */

  /* A.1.2 SystemVerilog source text */

  _description: $ => choice(
    $._directives,
    $.module_declaration,
    // $.udp_declaration,
    $.interface_declaration,
    $.program_declaration,
    $.package_declaration,
    seq(repeat($.attribute_instance), $.package_item),
    seq(repeat($.attribute_instance), $.bind_directive),
    // $.config_declaration,
  ),

  // module_nonansi_header ::=
  //   { attribute_instance } module_keyword [ lifetime ] module_identifier
  //     { package_import_declaration } [ parameter_port_list ] list_of_ports ';'
  //
  // module_ansi_header ::=
  //   { attribute_instance } module_keyword [ lifetime ] module_identifier
  //     { package_import_declaration } [ parameter_port_list ] [ list_of_port_declarations ] ';'
  //
  // module_declaration ::=
  //   module_nonansi_header [ timeunits_declaration ] { module_item }
  //     'endmodule' [ ':' module_identifier ]
  // | module_ansi_header [ timeunits_declaration ] { non_port_module_item }
  //     'endmodule' [ ':' module_identifier ]
  // | { attribute_instance } module_keyword [ lifetime ] module_identifier '(' '.*' ')' ';'
  //   [ timeunits_declaration ] { module_item } 'endmodule' [ ':' module_identifier ]
  // | 'extern' module_nonansi_header
  // | 'extern' module_ansi_header

  module_nonansi_header: $ => seq(
    // repeat($.attribute_instance),
    // $.module_keyword,
    // optional($.lifetime),
    // $.identifier, // module_identifier

    // package_import_declaration*
    // optional($.parameter_port_list),
    $.list_of_ports,
    ';'
  ),

  module_ansi_header: $ => seq(
    // repeat($.attribute_instance),
    // $.module_keyword,
    // optional($.lifetime),
    // $.identifier, // module_identifier

    //    package_import_declaration*

    // A.10 Footnotes (normative)
    // 1) A package_import_declaration in a module_ansi_header,
    //    interface_ansi_header, or program_ansi_header shall be followed
    //    by a parameter_port_list or list_of_port_declarations, or both.
    choice(
      seq(
        $.parameter_port_list,
        $.list_of_port_declarations
      ),
      $.list_of_port_declarations1,
    ),
    ';'
  ),

  module_header: $ => seq(
    repeat($.attribute_instance),
    $.module_keyword,
    optional($.lifetime),
    $.module_identifier,
    // optional($.parameter_port_list)
  ),

  module_declaration: $ => choice(
    seq(
      $.module_header,
      choice(
        seq(
          '(', '.*', ')', ';',
          // timeunits_declaration?
          // repeat($._module_item),
        ),
        seq(
          $.module_nonansi_header,
          repeat($._module_item),
        ),
        seq(
          $.module_ansi_header,
          // timeunits_declaration?
          repeat($._non_port_module_item),
        ),
        seq(
          ';',
          repeat($._module_item),
        )
      ),
      'endmodule', optional(seq(':', $.module_identifier))
    ),
    seq('extern', $.module_header, choice(
      $.module_nonansi_header,
      $.module_ansi_header
    )),
  ),

  module_keyword: $ => choice('module', 'macromodule'),

  interface_declaration: $ => choice(
    seq(
      $.interface_nonansi_header,
      optional($.timeunits_declaration),
      repeat($.interface_item),
      'endinterface', optional(seq(':', $.interface_identifier))
    ),
    seq(
      $.interface_ansi_header,
      optional($.timeunits_declaration),
      repeat($.non_port_interface_item),
      'endinterface', optional(seq(':', $.interface_identifier))
    ),
    seq(
      repeat($.attribute_instance),
      'interface',
      $.interface_identifier,
      '(', '.*', ')', ';',
      optional($.timeunits_declaration),
      repeat($.interface_item),
      'endinterface', optional(seq(':', $.interface_identifier))
    ),
    seq('extern', $.interface_nonansi_header),
    seq('extern', $.interface_ansi_header)
  ),

  interface_nonansi_header: $ => seq(
    repeat($.attribute_instance),
    'interface',
    optional($.lifetime),
    $.interface_identifier,
    repeat($.package_import_declaration),
    optional($.parameter_port_list),
    $.list_of_ports,
    ';'
  ),

  interface_ansi_header: $ => seq(
    repeat($.attribute_instance),
    'interface',
    optional($.lifetime),
    $.interface_identifier,
    repeat($.package_import_declaration),
    optional($.parameter_port_list),
    optional($.list_of_port_declarations),
    ';'
  ),

  program_declaration: $ => choice(
    seq(
      $.program_nonansi_header,
      optional($.timeunits_declaration),
      repeat($.program_item),
      'endprogram', optional(seq(':', $.program_identifier))
    ),
    seq(
      $.program_ansi_header,
      optional($.timeunits_declaration),
      repeat($.non_port_program_item),
      'endprogram', optional(seq(':', $.program_identifier))
    ),
    seq(
      repeat($.attribute_instance),
      'program',
      $.program_identifier,
      '(', '.*', ')', ';',
      optional($.timeunits_declaration),
      repeat($.program_item),
      'endprogram', optional(seq(':', $.program_identifier))
    ),
    seq('extern', $.program_nonansi_header),
    seq('extern', $.program_ansi_header)
  ),

  program_nonansi_header: $ => seq(
    repeat($.attribute_instance),
    'program',
    optional($.lifetime),
    $.program_identifier,
    repeat($.package_import_declaration),
    optional($.parameter_port_list),
    $.list_of_ports,
    ';'
  ),

  program_ansi_header: $ => seq(
    repeat($.attribute_instance),
    'program',
    optional($.lifetime),
    $.program_identifier,
    repeat($.package_import_declaration),
    optional($.parameter_port_list),
    $.list_of_port_declarations,
    ';'
  ),

  checker_declaration: $ => seq(
    'checker',
    $.checker_identifier,
    optional(seq('(', optional($.checker_port_list), ')')),
    ';',
    repeat(seq(
      repeat($.attribute_instance),
      $.checker_or_generate_item
    )),
    'endchecker', optional(seq(':', $.checker_identifier))
  ),

  class_declaration: $ => seq(
    optional('virtual'),
    'class',
    optional($.lifetime),
    $.class_identifier,
    optional($.parameter_port_list),
    optional(seq(
      'extends',
      $.class_type,
      optional($.list_of_arguments_parent)
    )),
    optional(seq(
      'implements',
      sep1(',', $.interface_class_type)
    )),
    ';',
    repeat($.class_item),
    'endclass', optional(seq(':', $.class_identifier))
  ),

  interface_class_type: $ => seq(
    $.ps_class_identifier,
    optional($.parameter_value_assignment)
  ),

  interface_class_declaration: $ => seq(
    'interface', 'class',
    $.class_identifier,
    optional($.parameter_port_list),
    optional(seq(
      'extends',
      optional(sep1(',', $.interface_class_type)),
      ';'
    )),
    repeat($.interface_class_item),
    'endclass', optional(seq(':', $.class_identifier))
  ),

  interface_class_item: $ => choice(
    $.type_declaration,
    seq(repeat($.attribute_instance), $.interface_class_method),
    seq($.any_parameter_declaration, ';'),
    ';'
  ),

  interface_class_method: $ => seq('pure', 'virtual', $.method_prototype, ';'),

  package_declaration: $ => seq(
    repeat($.attribute_instance),
    'package', optional($.lifetime), $.package_identifier, ';',
    optional($.timeunits_declaration),
    repeat(seq($.attribute_instance), $.package_item),
    'endpackage', optional(seq(':', $.package_identifier))
  ),

  timeunits_declaration: $ => choice(
    seq('timeunit', $.time_literal, optional(seq('/', $.time_literal)), ';'),
    seq('timeprecision', $.time_literal, ';'),
    // seq('timeunit', $.time_literal, ';', 'timeprecision', $.time_literal, ';'),
    // seq('timeprecision', $.time_literal, ';', 'timeunit', $.time_literal, ';')
  ),

  /* A.1.3 Module parameters and ports */

  parameter_port_list: $ => seq(
    '#', '(',
    optional(choice(
      seq($.list_of_param_assignments, repeat(seq(',', $.parameter_port_declaration))),
      sep1(',', $.parameter_port_declaration)
    )),
    ')'
  ),

  parameter_port_declaration: $ => choice(
    $.any_parameter_declaration,
    seq($.data_type, $.list_of_param_assignments),
    seq('type', $.list_of_type_assignments)
  ),

  list_of_ports: $ => seq('(', optional(sep1(',', $.port)), ')'),

  list_of_port_declarations: $ => seq(
    '(',
    optional(seq(
      repeat($.attribute_instance),
      $.ansi_port_declaration
    )),
    repeat(seq(
      ',',
      repeat($.attribute_instance),
      $.ansi_port_declaration
    )),
    ')'
  ),

  list_of_port_declarations1: $ => seq(
    '(',
    seq(
      repeat($.attribute_instance),
      $.ansi_port_declaration
    ),
    repeat(seq(
      ',',
      repeat($.attribute_instance),
      $.ansi_port_declaration
    )),
    ')'
  ),

  port_declaration: $ => seq(
    repeat($.attribute_instance),
    choice(
      $.inout_declaration,
      $.input_declaration,
      $.output_declaration,
      $.ref_declaration,
      // $.interface_port_declaration,
    )
  ),

  port: $ => choice(
    $._port_expression,
    seq('.', $.port_identifier, '(', optional($._port_expression), ')')
  ),

  _port_expression: $ => choice(
    $.port_reference,
    // seq('{', sep1(',', $.port_reference), '}')
  ),

  port_reference: $ => seq(
    $.port_identifier,
    optional($.constant_select1)
  ),

  port_direction: $ => choice(
    'input',
    'output',
    'inout',
    'ref'
  ),

  net_port_header: $ => seq(
    $.port_direction,
    optional($.net_port_type)
  ),

  variable_port_header: $ => seq(
    optional($.port_direction),
    $.variable_port_type
  ),

  interface_port_header: $ => seq(
    choice(
      $.interface_identifier,
      'interface'
    ),
    optional(seq('.', $.modport_identifier))
  ),

  ansi_port_declaration: $ => choice(
    seq(
      // optional(choice($.net_port_header, $.interface_port_header)),
      $.net_port_header, // reordered : made net_port_header mandatory
      $.port_identifier,
      repeat($.unpacked_dimension),
      optional(seq('=', $.constant_expression))
    ),
    // seq(
    //   optional($.variable_port_header),
    //   $.port_identifier,
    //   repeat($._variable_dimension),
    //   optional('=', $.constant_expression)
    // ),
    // seq(
    //   optional($.port_direction),
    //   '.',
    //   $.port_identifier,
    //   '(',
    //   optional($.expression),
    //   ')'
    // )
  ),

  /* A.1.4 Module items */

  elaboration_system_task: $ => choice(
    seq(
      '$fatal',
      optional(seq(
        '(', // $.finish_number, optional(seq(',', $.list_of_arguments)), ')' // FIXME
      )),
      ';'
    ),
    seq(
      choice('$error', '$warning', '$info'),
      optional($.list_of_arguments_parent),
      ';'
    ),
  ),

  finish_number: $ => choice('0', '1', '2'),

  _module_common_item: $ => choice(
    $._module_or_generate_item_declaration,
    $.interface_instantiation,
    $.program_instantiation,
    // $.assertion_item,
    $.bind_directive,
    $.continuous_assign,
    // $.net_alias,
    $.initial_construct,
    $.final_construct,
    $.always_construct,
    $.loop_generate_construct,
    $.conditional_generate_construct,
    $.elaboration_system_task
  ),

  _module_item: $ => choice(
    seq($.port_declaration, ';'),
    $._non_port_module_item
  ),

  module_or_generate_item: $ => seq(
    repeat($.attribute_instance),
    choice(
      $.parameter_override,
      // $.gate_instantiation,
      // $.udp_instantiation,
      $.module_instantiation,
      $._module_common_item
    )
  ),

  _module_or_generate_item_declaration: $ => choice(
    $._package_or_generate_item_declaration
    //  $.genvar_declaration
    //  $.clocking_declaration
    //  seq('default' __ 'clocking' __ clocking_identifier __ ';')
    //  seq('default' __ 'disable' __ 'iff' __ expression_or_dist __ ';')
  ),

  _non_port_module_item: $ => choice(
    $._directives,
    // $.generate_region,
    $.module_or_generate_item,
    //  $.specify_block
    //  ( attribute_instance __ )* specparam_declaration
    //  $.program_declaration
    // $.module_declaration,
    //  $.interface_declaration
    //  $.timeunits_declaration
  ),

  parameter_override: $ => seq(
    'defparam',
    $.list_of_defparam_assignments,
    ';'
  ),

  bind_directive: $ => seq(
    'bind',
    choice(
      seq(
        $.bind_target_scope,
        optional(seq(':', $.bind_target_instance_list))
      ),
      $.bind_target_instance
    ),
    $.bind_instantiation,
    ';'
  ),

  bind_target_scope: $ => choice(
    $.module_identifier,
    $.interface_identifier
  ),

  bind_target_instance: $ => seq(
    $.hierarchical_identifier,
    optional($.constant_bit_select1)
  ),

  bind_target_instance_list: $ => sep1(',', $.bind_target_instance),

  bind_instantiation: $ => choice(
    $.program_instantiation,
    $.module_instantiation,
    $.interface_instantiation,
    $.checker_instantiation
  ),

  /* A.1.5 Configuration source text */

  // config_declaration ::=
  // config config_identifier ;
  // { local_parameter_declaration ; }
  // design_statement
  // { config_rule_statement }
  // endconfig [ : config_identifier ]

  // design_statement ::= design { [ library_identifier . ] cell_identifier } ;

  // config_rule_statement ::=
  // default_clause liblist_clause ;
  //   |
  //  inst_clause
  //  liblist_clause ;
  // |
  //  inst_clause
  //  use_clause ;
  // |
  //  cell_clause
  //  liblist_clause ;
  // |
  //  cell_clause
  //  use_clause ;
  // default_clause ::= default
  // inst_clause ::= instance inst_name
  // inst_name ::= topmodule_identifier { . instance_identifier }
  // cell_clause ::= cell [ library_identifier . ] cell_identifier
  // liblist_clause ::= liblist {library_identifier}
  // use_clause ::= use [ library_identifier . ] cell_identifier [ : config ]
  // | use named_parameter_assignment { , named_parameter_assignment } [ : config ]
  // | use [ library_identifier . ] cell_identifier named_parameter_assignment
  // { , named_parameter_assignment } [ : config ]


  /* A.1.6 Interface items */

  interface_or_generate_item: $ => choice(
    seq(repeat($.attribute_instance), $._module_common_item),
    seq(repeat($.attribute_instance), $.extern_tf_declaration)
  ),

  extern_tf_declaration: $ => choice(
    seq('extern', $.method_prototype, ';'),
    seq('extern', 'forkjoin', $.task_prototype, ';')
  ),

  interface_item: $ => choice(
    seq($.port_declaration, ';'),
    $.non_port_interface_item
  ),

  non_port_interface_item: $ => choice(
    $.generate_region,
    $.interface_or_generate_item,
    $.program_declaration,
    $.modport_declaration,
    $.interface_declaration,
    $.timeunits_declaration
  ),

  /* A.1.7 Program items */

  program_item: $ => choice(
    seq($.port_declaration, ';'),
    $.non_port_program_item
  ),

  non_port_program_item: $ => choice(
    seq(repeat($.attribute_instance), $.continuous_assign),
    seq(repeat($.attribute_instance), $._module_or_generate_item_declaration),
    seq(repeat($.attribute_instance), $.initial_construct),
    seq(repeat($.attribute_instance), $.final_construct),
    // seq(repeat($.attribute_instance), $.concurrent_assertion_item),
    $.timeunits_declaration,
    $.program_generate_item
  ),

  program_generate_item: $ => choice(
    $.loop_generate_construct,
    $.conditional_generate_construct,
    $.generate_region,
    $.elaboration_system_task
  ),

  /* A.1.8 Checker items */

  checker_port_list: $ => sep1(',', $.checker_port_item),

  checker_port_item: $ => seq(
    repeat($.attribute_instance),
    optional($.checker_port_direction),
    optional($.property_formal_type1),
    $.formal_port_identifier,
    repeat($._variable_dimension),
    // optional(seq('=', $.property_actual_arg))
  ),

  checker_port_direction: $ => choice('input', 'output'),

  checker_or_generate_item: $ => choice(
    $.checker_or_generate_item_declaration,
    $.initial_construct,
    $.always_construct,
    $.final_construct,
    // $.assertion_item,
    $.continuous_assign,
    $.checker_generate_item
  ),

  checker_or_generate_item_declaration: $ => choice(
    seq(optional('rand'), $.data_declaration),
    $.function_declaration,
    $.checker_declaration,
    // $.assertion_item_declaration,
    // $.covergroup_declaration,
    // $.genvar_declaration,
    // $.clocking_declaration,
    seq('default', 'clocking', $.clocking_identifier, ';'),
    seq('default', 'disable', 'iff', $.expression_or_dist, ';'),
    ';'
  ),

  checker_generate_item: $ => choice(
    $.loop_generate_construct,
    $.conditional_generate_construct,
    $.generate_region,
    $.elaboration_system_task
  ),

  /* A.1.9 Class items */

  class_item: $ => choice(
    seq(repeat($.attribute_instance), $.class_property),
    seq(repeat($.attribute_instance), $.class_method),
    seq(repeat($.attribute_instance), $.class_constraint),
    seq(repeat($.attribute_instance), $.class_declaration),
    // seq(repeat($.attribute_instance), $.covergroup_declaration),
    seq($.any_parameter_declaration, ';'),
    ';'
  ),

  class_property: $ => choice(
    // seq(repeat($.property_qualifier, $.data_declaration)),
    seq(
      'const',
      repeat($.class_item_qualifier),
      $.data_type,
      $.const_identifier,
      optional(seq('=', $.constant_expression)),
      ';'
    )
  ),

  class_method: $ => choice(
    seq(repeat($.method_qualifier), $.task_declaration),
    seq(repeat($.method_qualifier), $.function_declaration),
    seq('pure', 'virtual', repeat($.class_item_qualifier), $.method_prototype, ';'),
    seq('extern', repeat($.method_qualifier), $.method_prototype, ';'),
    seq(repeat($.method_qualifier), $.class_constructor_declaration),
    seq('extern', repeat($.method_qualifier), $.class_constructor_prototype)
  ),

  class_constructor_prototype: $ => seq(
    'function', 'new', optional('(', optional($.tf_port_list), ')'), ';'
  ),

  class_constraint: $ => choice(
    $.constraint_prototype,
    $.constraint_declaration
  ),

  class_item_qualifier: $ => choice('static', 'protected', 'local'),

  property_qualifier: $ => choice(
    $.random_qualifier,
    $.class_item_qualifier
  ),

  random_qualifier: $ => choice('rand', 'randc'),

  method_qualifier: $ => choice(
    seq(optional('pure'), 'virtual'),
    $.class_item_qualifier
  ),

  method_prototype: $ => choice(
    $.task_prototype,
    // $.function_prototype
  ),

  class_constructor_declaration: $ => seq(
    'function',
    optional($.class_scope),
    'new',
    optional(seq('(', optional($.tf_port_list), ')')),
    ';',
    repeat($.block_item_declaration),
    optional(seq(
      'super', '.', 'new',
      optional($.list_of_arguments_parent),
      ';'
    )),
    repeat($.function_statement_or_null),
    'endfunction', optional(seq(':', 'new'))
  ),

  /* A.1.10 Constraints */

  constraint_declaration: $ => seq(
      optional('static'),
      'constraint',
      $.constraint_identifier,
      $.constraint_block
  ),

  constraint_block: $ => seq('{', repeat($.constraint_block_item), '}'),

  constraint_block_item: $ => choice(
    seq('solve', $.solve_before_list, 'before', $.solve_before_list, ';'),
    $.constraint_expression
  ),

  solve_before_list: $ => sep1(',', $.constraint_primary),

  constraint_primary: $ => seq(
    optional(choice(
      seq($.implicit_class_handle, '.'),
      $.class_scope
    )),
    $.hierarchical_identifier,
    optional($.select1)
  ),

  constraint_expression: $ => choice(
    seq(optional('soft'), $.expression_or_dist, ';'),
    seq($.uniqueness_constraint, ';'),
    seq($.expression, '–>', $.constraint_set),
    prec.left(seq(
      'if', '(', $.expression, ')',
      $.constraint_set,
      optional(seq(
        'else', $.constraint_set
      ))
    )),
    seq(
      'foreach',
      '(',
      $.ps_or_hierarchical_array_identifier,
      '[', optional($.loop_variables1), ']',
      ')',
      $.constraint_set
    ),
    seq('disable', 'soft', $.constraint_primary, ';'),
  ),

  uniqueness_constraint: $ => seq(
    'unique', '{', $.open_range_list, '}'
  ),

  constraint_set: $ => choice(
    $.constraint_expression,
    seq('{', repeat($.constraint_expression), '}')
  ),

  dist_list: $ => sep1(',', $.dist_item),

  dist_item: $ => seq($.value_range, optional($.dist_weight)),

  dist_weight: $ => seq(choice(':=', ':/'), $.expression),

  constraint_prototype: $ => seq(
    optional($.constraint_prototype_qualifier),
    optional('static'),
    'constraint',
    $.constraint_identifier,
    ';'
  ),

  constraint_prototype_qualifier: $ => choice('extern', 'pure'),

  extern_constraint_declaration: $ => seq(
    optional('static'),
    'constraint',
    $.class_scope,
    $.constraint_identifier,
    $.constraint_block
  ),

  identifier_list: $ => sep1(',', $.identifier),


  /* A.1.11 Package items */

  package_item: $ => choice(
    $._package_or_generate_item_declaration
    //  / anonymous_program
    //  / package_export_declaration
    //  / timeunits_declaration
  ),

  _package_or_generate_item_declaration: $ => choice(
    $.net_declaration,
    $.data_declaration,
    $.task_declaration,
    $.function_declaration,
    $.checker_declaration,
    $.dpi_import_export,
    $.extern_constraint_declaration,
    $.class_declaration,
    $.class_constructor_declaration,
    seq($.any_parameter_declaration, ';'),
    // $.covergroup_declaration,
    $.overload_declaration,
    // $.assertion_item_declaration,
    ';'
  ),

  /*
  anonymous_program
    = 'program' __ ';' ( __ anonymous_program_item )* __ 'endprogram'

  anonymous_program_item
    = task_declaration
    / function_declaration
    / class_declaration
    / covergroup_declaration
    / class_constructor_declaration
    / ';'
  */

  /* A.2 Declarations */

  /* A.2.1 Declaration types */

  /* A.2.1.1 Module parameter declarations */

  /* combined:
    local_parameter_declaration
    parameter_declaration
  */

  any_parameter_declaration: $ => seq(
    choice('parameter', 'localparam'),
    choice(
      seq(
        optional($.data_type_or_implicit1),
        $.list_of_param_assignments
      ),
      seq('type', $.list_of_type_assignments)
    )
  ),

  specparam_declaration: $ => seq(
    'specparam',
    optional($.packed_dimension),
    $.list_of_specparam_assignments,
    ';'
  ),

  /* A.2.1.2 Port declarations */

  inout_declaration: $ => seq(
    'inout',
    optional($.net_port_type),
    $.list_of_port_identifiers
  ),

  input_declaration: $ => seq(
    'input', choice(
      seq(
        optional($.net_port_type),
        // $.list_of_port_identifiers
      ),
      seq(
        optional($.variable_port_type),
        // $.list_of_variable_identifiers
      )
    ),
    $.list_of_port_identifiers
  ),

  output_declaration: $ => seq(
    'output', choice(
      seq(
        optional($.net_port_type),
        // $.list_of_port_identifiers
      ),
      seq(
        optional($.variable_port_type),
        // $.list_of_variable_identifiers
      ),
    ),
    $.list_of_port_identifiers
  ),

  interface_port_declaration: $ => seq(
    $.interface_identifier,
    optional(seq('.', $.modport_identifier)),
    $.list_of_interface_identifiers
  ),

  ref_declaration: $ => seq(
    'ref',
    $.variable_port_type,
    $.list_of_variable_identifiers
  ),

  // A.2.1.3 Type declarations

  data_declaration: $ => choice(
    seq(
      optional('const'),
      optional('var'),
      optional($.lifetime),
      optional($.data_type_or_implicit1),
      $.list_of_variable_decl_assignments,
      ';'
    ),
    // $.type_declaration,
    $.package_import_declaration,
    // $.net_type_declaration
  ),

  package_import_declaration: $ => seq(
    'import',
    sep1(',', $.package_import_item),
    ';'
  ),

  package_import_item: $ => seq(
    $.package_identifier,
    '::',
    choice(
      $.identifier,
      '*'
    )
  ),

  package_export_declaration: $ => seq(
    'export',
    choice(
      seq(
        '*::*',
        ';'
      ),
      seq(sep1(',', $.package_import_item), ';')
    )
  ),

  genvar_declaration: $ => seq('genvar', $.list_of_genvar_identifiers, ';'),

  net_declaration: $ => choice(
    seq(
      $.net_type,
      optional(choice($.drive_strength, $.charge_strength)),
      optional(choice('vectored', 'scalared')),
      optional($.data_type_or_implicit1),
      optional($.delay3),
      $.list_of_net_decl_assignments,
      ';'
    ),
    // seq(
    //   $.net_type_identifier,
    //   optional($.delay_control),
    //   $.list_of_net_decl_assignments,
    //   ';'
    // ),
    // seq(
    //   'interconnect',
    //   $.implicit_data_type,
    //   optional(seq('#', $.delay_value)),
    //   sep1(',' , seq($.net_identifier, repeat($.unpacked_dimension))),
    //   ';'
    // )
  ),

  type_declaration: $ => seq(
    'typedef',
    choice(
      seq(
        $.data_type,
        $.type_identifier,
        repeat($._variable_dimension),
        ';'
      ),
      seq(
        $.interface_instance_identifier,
        optional($.constant_bit_select1),
        '.',
        $.type_identifier,
        $.type_identifier,
        ';'
      ),
      seq(
        optional(choice(
          'enum', 'struct', 'union', 'class', seq('interface', 'class')
        )),
        $.type_identifier,
        ';'
      )
    )
  ),

  net_type_declaration: $ => seq(
    'nettype',
    choice(
      seq(
        $.data_type,
        $.net_type_identifier,
        optional(seq(
          'with',
          optional(choice(
            $.package_scope,
            $.class_scope
          )),
          $.tf_identifier
        )),
        ';'
      ),
      seq(
        optional(choice(
          $.package_scope,
          $.class_scope
        )),
        $.net_type_identifier,
        $.net_type_identifier
      )
    )
  ),

  lifetime: $ => choice('static', 'automatic'),


  /* A.2.2 Declaration data types */

  /* A.2.2.1 Net and variable types */

  casting_type: $ => choice(
    $.simple_type,
    $.constant_primary,
    $._signing,
    'string',
    'const'
  ),

  data_type: $ => choice(
    seq($.integer_vector_type, optional($._signing), repeat($.packed_dimension)),
    seq($.integer_atom_type, optional($._signing)),
    $.non_integer_type,
    //  / struct_union ( 'packed' signing? )?
    //    '{' struct_union_member struct_union_member* '}'
    //    packed_dimension*
    /*/ 'enum' enum_base_type?*/
    /*'{' enum_name_declaration ( ',' enum_name_declaration )* '}'*/
    /*packed_dimension**/
    'string',
    'chandle',
    /*/ 'virtual' 'interface'? interface_identifier parameter_value_assignment?*/
    /*( '.' modport_identifier )?*/
    /*/ ( class_scope / package_scope )?*/
    /*type_identifier*/
    /*packed_dimension**/
    /*/ class_type*/
    'event',
    /*/ ps_covergroup_identifier*/
    // $.type_reference
  ),

  data_type_or_implicit1: $ => choice(
    $.data_type,
    $.implicit_data_type1
  ),

  implicit_data_type1: $ => seq(
    optional($._signing),
    repeat1($.packed_dimension) // reordered : repeat -> repeat1
  ),

  _enum_base_type: $ => choice(
    seq(
      $.integer_atom_type,
      optional($._signing)
    ),
    seq(
      $.integer_vector_type,
      optional($._signing),
      /* packed_dimension* */
    ),
    // seq(
    //   /*/ type_identifier*/
    //   /*packed_dimension**/
    // )
  ),

  enum_name_declaration: $ => seq(
    $.enum_identifier, optional(seq(
      '[',
      $.integral_number,
      optional(seq(':', $.integral_number)),
      ']'
    )), optional(seq('=', $.constant_expression))
  ),

  class_scope: $ => seq($.class_type, '::'),

  class_type: $ => prec.left(seq(
    $.ps_class_identifier,
    optional($.parameter_value_assignment),
    repeat(seq(
      '::',
      $.class_identifier,
      optional($.parameter_value_assignment)
    ))
  )),

  _integer_type: $ => choice(
    $.integer_vector_type,
    $.integer_atom_type
  ),

  integer_atom_type: $ => choice('byte', 'shortint', 'int', 'longint', 'integer', 'time'),

  integer_vector_type: $ => choice('bit', 'logic', 'reg'),

  non_integer_type: $ => choice('shortreal', 'real', 'realtime'),

  net_type: $ => choice('supply0', 'supply1', 'tri', 'triand', 'trior', 'trireg', 'tri0', 'tri1', 'uwire', 'wire', 'wand', 'wor'),

  net_port_type: $ => choice(
    seq($.net_type, optional($.data_type_or_implicit1)),
    seq(optional($.net_type), $.data_type_or_implicit1),
    // $.net_type_identifier,
    // seq('interconnect', $.implicit_data_type)
  ),

  variable_port_type: $ => alias($._var_data_type, $._variable_port_type),

  _var_data_type: $ => choice(
    prec.left(-5, $.data_type),
    seq('var', optional($.data_type_or_implicit1))
  ),

  _signing: $ => choice('signed', 'unsigned'),

  simple_type: $ => choice(
    $._integer_type,
    $.non_integer_type,
    // $.ps_type_identifier
    $.ps_parameter_identifier
  ),

  /*
  struct_union_member
    = attribute_instance*
      random_qualifier?
      data_type_or_void
      list_of_variable_decl_assignments
      ';'
  */

  data_type_or_void: $ => choice(
    $.data_type,
    'void'
  ),

  _struct_union: $ => choice(
    'struct',
    seq('union', optional('tagged'))
  ),

  type_reference: $ => seq(
    'type', '(',
    choice(
      $.expression,
      $.data_type
    ),
    ')'
  ),

  // A.2.2.2 Strengths

  drive_strength: $ => seq(
    '(',
    choice(
      seq($.strength0, ',', $.strength1),
      seq($.strength1, ',', $.strength0),
      seq($.strength0, ',', 'highz1'),
      seq($.strength1, ',', 'highz0'),
      seq('highz0', ',', $.strength1),
      seq('highz1', ',', $.strength0)
    ),
    ')'
  ),

  strength0: $ => choice('supply0', 'strong0', 'pull0', 'weak0'),

  strength1: $ => choice('supply1', 'strong1', 'pull1', 'weak1'),

  charge_strength: $ => seq('(', choice('small', 'medium', 'large'), ')'),

  // A.2.2.3 Delays

  delay3: $ => seq('#', choice(
    $.delay_value,
    // seq(
    //   '(',
    //   $.mintypmax_expression,
    //   optional(seq(
    //     $.mintypmax_expression,
    //     optional($.mintypmax_expression)
    //   )),
    //   ')'
    // )
  )),

  delay2: $ => seq('#', choice(
    $.delay_value,
    seq(
      '(',
      $.mintypmax_expression, optional(
        $.mintypmax_expression
      ),
      ')'
    )
  )),

  delay_value: $ => choice(
    $.unsigned_number,
    $.real_number,
    $.ps_identifier,
    $.time_literal,
    '1step'
  ),

  /* A.2.3 Declaration lists */

  list_of_defparam_assignments: $ => sep1(',', $.defparam_assignment),

  list_of_genvar_identifiers: $ => sep1(',', $.genvar_identifier),

  list_of_interface_identifiers: $ => seq(
    $.interface_identifier,
    repeat($.unpacked_dimension),
    repeat(seq(
      ',',
      $.interface_identifier,
      repeat($.unpacked_dimension)
    ))
  ),

  list_of_net_decl_assignments: $ => sep1(',', $.net_decl_assignment),

  list_of_param_assignments: $ => sep1(',', $.param_assignment),

  list_of_port_identifiers: $ => sep1(',', seq(
    $.port_identifier,
    repeat($.unpacked_dimension)
  )),

  list_of_udp_port_identifiers: $ => sep1(',', $.port_identifier),

  list_of_specparam_assignments: $ => sep1(',', $.specparam_assignment),

  list_of_tf_variable_identifiers: $ => sep1(',', seq(
    $.port_identifier,
    repeat($._variable_dimension),
    optional(seq('=', $.expression))
  )),

  list_of_type_assignments: $ => sep1(',', $.type_assignment),

  list_of_variable_decl_assignments: $ => sep1(',', $.variable_decl_assignment),

  list_of_variable_identifiers: $ => sep1(',', seq(
    $.variable_identifier,
    optional($._variable_dimension)
  )),

  list_of_variable_port_identifiers: $ => sep1(',', seq(
    $.port_identifier,
    repeat($._variable_dimension),
    optional(seq('=', $.constant_expression))
  )),

  /* A.2.4 Declaration assignments */

  defparam_assignment: $ => seq(
    $.hierarchical_parameter_identifier,
    '=',
    $.constant_mintypmax_expression
  ),

  net_decl_assignment: $ => seq(
    $.net_identifier,
    repeat($.unpacked_dimension),
    optional(seq('=', $.expression))
  ),

  param_assignment: $ => seq(
    $.parameter_identifier,
    repeat($.unpacked_dimension),
    optional(seq('=', $.constant_param_expression))
  ),

  specparam_assignment: $ => choice(
    seq($.specparam_identifier, '=', $.constant_mintypmax_expression),
    // $.pulse_control_specparam
  ),

  type_assignment: $ => seq(
    $.type_identifier,
    optional(seq('=', $.data_type))
  ),

  // pulse_control_specparam
  //   = PATHPULSE$ = ( reject_limit_value [ , error_limit_value ] )
  // | PATHPULSE$specify_input_terminal_descriptor
  // $specify_output_terminal_descriptor
  // = ( reject_limit_value [ , error_limit_value ] )

  error_limit_value: $ => $.limit_value,

  reject_limit_value: $ => $.limit_value,

  limit_value: $ => $.constant_mintypmax_expression,

  variable_decl_assignment: $ => choice(
    seq(
      $.variable_identifier,
      repeat($._variable_dimension),
      optional(seq('=', $.expression))
    ),
    // seq(
    //   $.dynamic_array_variable_identifier,
    //   $.unsized_dimension,
    //   repeat($._variable_dimension),
    //   optional(seq('=', $.dynamic_array_new))
    // ),
    // seq(
    //   $.class_variable_identifier
    //   optional(seq('=', $.class_new))
    // )
  ),

  // class_new: $ => choice(
  //   seq(
  //     $.class_scope,
  //     'new',
  //     optional(seq('(', $.list_of_arguments, ')'))
  //   ),
  //   seq('new', $.expression)
  // ),

  dynamic_array_new: $ => seq(
    'new', '[', $.expression, ']',
    optional(seq('(', $.expression, ')'))
  ),

  // A.2.5 Declaration ranges

  unpacked_dimension: $ => seq(
    '[', choice(
      $.constant_range,
      // $.constant_expression
    ), ']'
  ),

  packed_dimension: $ => choice(
    seq('[', $.constant_range, ']'),
    $.unsized_dimension
  ),

  associative_dimension: $ => seq(
    '[', choice($.data_type, '*'), ']'
  ),

  _variable_dimension: $ => choice(
    $.unsized_dimension,
    $.unpacked_dimension,
    $.associative_dimension,
    $.queue_dimension
  ),

  queue_dimension: $ => seq(
    '[', '$', optional(seq(':', $.constant_expression)), ']'
  ),

  unsized_dimension: $ => seq('[', ']'),

  // A.2.6 Function declarations

  function_data_type_or_implicit1: $ => choice(
    $.data_type_or_void,
    $.implicit_data_type1
  ),

  function_declaration: $ => seq(
    'function',
    optional($.lifetime),
    $.function_body_declaration
  ),

  function_body_declaration: $ => seq(
    optional($.function_data_type_or_implicit1),
    optional(choice(
      seq($.interface_identifier, '.'),
      $.class_scope
    )),
    $.function_identifier,
    choice(
      seq(
        ';',
        repeat($.tf_item_declaration)
      ),
      seq(
        '(', optional($.tf_port_list), ')', ';',
        repeat($.block_item_declaration),
      )
    ),
    repeat($.function_statement_or_null),
    'endfunction',
    optional(seq(':', $.function_identifier))
  ),

  function_prototype: $ => seq(
    'function',
    $.data_type_or_void,
    $.function_identifier,
    optional(seq(
      '(', optional($.tf_port_list), ')'
    ))
  ),

  dpi_import_export: $ => choice(
    seq(
      'import',
      $.dpi_spec_string,
      optional($.dpi_function_import_property),
      optional(seq($.c_identifier, '=')),
      $.dpi_function_proto,
      ';'
    ),
    seq(
      'import',
      $.dpi_spec_string,
      optional($.dpi_task_import_property),
      optional(seq($.c_identifier, '=')),
      $.dpi_task_proto,
      ';'
    ),
    seq(
      'export',
      $.dpi_spec_string,
      optional(seq($.c_identifier, '=')),
      'function',
      $.function_identifier,
      ';'
    ),
    seq(
      'export',
      $.dpi_spec_string,
      optional(seq($.c_identifier, '=')),
      'task',
      $.task_identifier,
      ';'
    )
  ),

  dpi_spec_string: $ => choice('"DPI-C"', '"DPI"'),

  dpi_function_import_property: $ => choice('context', 'pure'),

  dpi_task_import_property: $ => 'context',

  dpi_function_proto: $ => $.function_prototype,

  dpi_task_proto: $ => $.task_prototype,


  // A.2.7 Task declarations

  task_declaration: $ => seq(
    'task',
    optional($.lifetime),
    $.task_body_declaration
  ),

  task_body_declaration: $ => seq(
    optional(choice(
      seq($.interface_identifier, '.'),
      $.class_scope
    )),
    $.task_identifier,
    choice(
      seq(
        ';',
        repeat($.tf_item_declaration)
      ),
      seq(
        '(', optional($.tf_port_list), ')', ';',
        repeat($.block_item_declaration)
      )
    ),
    repeat($.statement_or_null),
    'endtask',
    optional(seq(':', $.task_identifier))
  ),

  tf_item_declaration: $ => choice(
    $.block_item_declaration,
    $.tf_port_declaration
  ),

  tf_port_list: $ => sep1(',', $.tf_port_item1),

  tf_port_item1: $ => seq(
    repeat($.attribute_instance),
    optional($.tf_port_direction),
    optional('var'),
    // optional($.data_type_or_implicit1),
    $.data_type_or_implicit1,
    optional(seq(
      $.port_identifier,
      repeat($._variable_dimension),
      $.expression
    ))
  ),

  tf_port_direction: $ => choice(
    $.port_direction,
    seq('const', 'ref')
  ),

  tf_port_declaration: $ => seq(
    repeat($.attribute_instance),
    $.tf_port_direction,
    optional('var'),
    optional($.data_type_or_implicit1),
    $.list_of_tf_variable_identifiers,
    ';'
  ),

  task_prototype: $ => seq(
    'task',
    $.task_identifier,
    optional(seq('(', optional($.tf_port_list), ')'))
  ),


  // A.2.8 Block item declarations

  block_item_declaration: $ => seq(
    repeat($.attribute_instance),
    choice(
      $.data_declaration,
      seq($.any_parameter_declaration, ';'),
      $.overload_declaration,
      // $.let_declaration
    )
  ),

  overload_declaration: $ => seq(
    'bind',
    $.overload_operator,
    'function',
    $.data_type,
    $.function_identifier,
    '(',
    $.overload_proto_formals,
    ')',
    ';'
  ),

  overload_operator: $ => choice('+', '++', '–', '––', '*', '**', '/', '%', '==', '!=', '<', '<=', '>', '>=', '='),

  overload_proto_formals: $ => sep1(',', $.data_type),

  /* A.2.9 Interface declarations */

  modport_declaration: $ => seq('modport', sep1(',', $.modport_item), ';'),

  modport_item: $ => seq(
    $.modport_identifier,
    '(', sep1(',', $.modport_ports_declaration), ')'
  ),

  modport_ports_declaration: $ => seq(
    repeat($.attribute_instance),
    choice(
      $.modport_simple_ports_declaration,
      $.modport_tf_ports_declaration,
      $.modport_clocking_declaration
    )
  ),

  modport_clocking_declaration: $ => seq('clocking', $.clocking_identifier),

  modport_simple_ports_declaration: $ => seq(
    $.port_direction,
    sep1(',', $.modport_simple_port)
  ),

  modport_simple_port: $ => choice(
    $.port_identifier,
    seq('.', $.port_identifier, '(', optional($.expression), ')')
  ),

  modport_tf_ports_declaration: $ => seq(
    $.import_export, sep1(',', $.modport_tf_port)
  ),

  modport_tf_port: $ => choice(
    $.method_prototype,
    $.tf_identifier
  ),

  import_export: $ => choice('import', 'export'),

  // A.2.10 Assertion declarations

  // concurrent_assertion_item ::=
  // [ block_identifier : ] concurrent_assertion_statement
  // | checker_instantiation
  // concurrent_assertion_statement ::=
  // assert_property_statement
  // | assume_property_statement
  // | cover_property_statement
  // | cover_sequence_statement
  // | restrict_property_statement
  // assert_property_statement::=
  // assert property ( property_spec ) action_block
  // assume_property_statement::=
  // assume property ( property_spec ) action_block
  // cover_property_statement::=
  // cover property ( property_spec ) statement_or_null
  // expect_property_statement ::=
  // expect ( property_spec ) action_block
  // cover_sequence_statement::=
  // cover sequence ( [clocking_event ] [ disable iff ( expression_or_dist ) ]
  // sequence_expr ) statement_or_null
  // restrict_property_statement::=
  // restrict property ( property_spec ) ;
  // property_instance ::=
  // ps_or_hierarchical_property_identifier [ ( [ property_list_of_arguments ] ) ]
  // property_list_of_arguments ::=
  // [property_actual_arg] { , [property_actual_arg] } { , . identifier ( [property_actual_arg]| . identifier ( [property_actual_arg] ) { , . identifier ( [property_actual_arg] ) }

  property_actual_arg: $ => choice(
    $.property_expr,
    // $.sequence_actual_arg
  ),

  assertion_item_declaration: $ => choice(
    $.property_declaration,
    $.sequence_declaration,
    // $.let_declaration
  ),

  property_declaration: $ => seq(
    'property',
    $.property_identifier,
    optional(seq(
      '(', optional($.property_port_list), ')'
    )),
    ';',
    repeat($.assertion_variable_declaration),
    $.property_spec,
    optional(';'),
    'endproperty', optional(seq(':', $.property_identifier))
  ),

  property_port_list: $ => sep1(',', $.property_port_item),

  property_port_item: $ => seq(
    repeat($.attribute_instance),
    optional(seq(
      'local',
      optional($.property_lvar_port_direction)
    )),
    $.property_formal_type1,
    $.formal_port_identifier,
    repeat($._variable_dimension),
    optional(seq('=', $.property_actual_arg))
  ),

  property_lvar_port_direction: $ => 'input',

  property_formal_type1: $ => choice(
    $.sequence_formal_type1,
    'property'
  ),

  property_spec: $ => seq(
    optional($.clocking_event),
    optional(seq(
      'disable', 'iff', '(', $.expression_or_dist, ')'
    )),
    $.property_expr
  ),

  property_expr: $ => choice(
    $.sequence_expr,
    seq('strong', '(', $.sequence_expr, ')'),
    seq('weak', '(', $.sequence_expr, ')'),
    seq('(', $.property_expr, ')'),
    // seq('not', $.property_expr),
    prec.left(seq($.property_expr, 'or', $.property_expr)),
    prec.left(seq($.property_expr, 'and', $.property_expr)),
    prec.right(seq($.sequence_expr, '|->', $.property_expr)),
    prec.right(seq($.sequence_expr, '|=>', $.property_expr)),
    // seq(if ( expression_or_dist ) property_expr [ else property_expr ]),
    // seq(case ( expression_or_dist ) property_case_item { property_case_item } endcase),
    // seq(sequence_expr #-# property_expr),
    // seq(sequence_expr #=# property_expr),
    // seq(nexttime property_expr),
    // seq(nexttime [ constant _expression ] property_expr),
    // seq(s_nexttime property_expr),
    // seq(s_nexttime [ constant_expression ] property_expr),
    // seq(always property_expr),
    // seq(always [ cycle_delay_const_range_expression ] property_expr),
    // seq(s_always [ constant_range] property_expr),
    // seq(s_eventually property_expr),
    // seq(eventually [ constant_range ] property_expr),
    // seq(s_eventually [ cycle_delay_const_range_expression ] property_expr),
    // seq(property_expr until property_expr),
    // seq(property_expr s_until property_expr),
    // seq(property_expr until_with property_expr),
    // seq(property_expr s_until_with property_expr),
    // seq(property_expr implies property_expr),
    // seq(property_expr iff property_expr),
    // seq(accept_on ( expression_or_dist ) property_expr),
    // seq(reject_on ( expression_or_dist ) property_expr),
    // seq(sync_accept_on ( expression_or_dist ) property_expr),
    // seq(sync_reject_on ( expression_or_dist ) property_expr),
    // seq(property_instance),
    // seq(clocking_event property_expr),
  ),

  property_case_item: $ => choice(
    seq(
      sep1(',', $.expression_or_dist), ':', $.property_expr, ';'
    ),
    seq(
      'default', optional(':'), $.property_expr, ';'
    )
  ),

  sequence_declaration: $ => seq(
    'sequence',
    $.sequence_identifier,
    optional(seq(
      '(', optional($.sequence_port_list), ')'
    )),
    ';',
    repeat($.assertion_variable_declaration),
    $.sequence_expr,
    optional(';'),
    'endsequence', optional(seq(':', $.sequence_identifier))
  ),

  sequence_port_list: $ => sep1(',', $.sequence_port_item),

  sequence_port_item: $ => seq(
    repeat($.attribute_instance),
    optional(seq(
      'local',
      optional($.sequence_lvar_port_direction)
    )),
    optional($.sequence_formal_type1),
    $.formal_port_identifier,
    repeat($._variable_dimension),
    optional(seq(
      '=', $.sequence_actual_arg
    ))
  ),

  sequence_lvar_port_direction: $ => choice('input', 'inout', 'output'),

  sequence_formal_type1: $ => choice(
    $.data_type_or_implicit1,
    'sequence',
    'untyped'
  ),

  sequence_expr: $ => choice(
  // cycle_delay_range sequence_expr { cycle_delay_range sequence_expr }
  // | sequence_expr cycle_delay_range sequence_expr { cycle_delay_range sequence_expr }
    seq($.expression_or_dist, optional($.boolean_abbrev)),
  // | sequence_instance [ sequence_abbrev ]
  // | ( sequence_expr {, sequence_match_item } ) [ sequence_abbrev ]
  // | sequence_expr and sequence_expr
  // | sequence_expr intersect sequence_expr
  // | sequence_expr or sequence_expr
  // | first_match ( sequence_expr {, sequence_match_item} )
  // | expression_or_dist throughout sequence_expr
  // | sequence_expr within sequence_expr
  // | clocking_event sequence_expr
  ),

  // cycle_delay_range ::=
  // ## constant_primary
  // | ## [ cycle_delay_const_range_expression ]
  // | ##[*]
  // | ##[+]
  // sequence_method_call ::=
  // sequence_instance . method_identifier
  // sequence_match_item ::=
  // operator_assignment
  // | inc_or_dec_expression
  // | subroutine_call
  // sequence_instance ::=
  // ps_or_hierarchical_sequence_identifier [ ( [ sequence_list_of_arguments ] ) ]
  // sequence_list_of_arguments ::=
  // [sequence_actual_arg] { , [sequence_actual_arg] } { , . identifier ( [sequence_actual_arg]| . identifier ( [sequence_actual_arg] ) { , . identifier ( [sequence_actual_arg] ) }

  sequence_actual_arg: $ => choice(
    $.event_expression,
    $.sequence_expr
  ),

  boolean_abbrev: $ => choice(
    // $.consecutive_repetition
    // $.non_consecutive_repetition
    $.goto_repetition1 // FIXME
  ),

  // sequence_abbrev ::= consecutive_repetition

  // consecutive_repetition ::=
  // [* const_or_range_expression ]
  // | [*]
  // | [+]

  // non_consecutive_repetition ::= [= const_or_range_expression ]

  goto_repetition1: $ => seq(
    '->',
    // $.const_or_range_expression
  ),

  // const_or_range_expression ::=
  // constant_expression
  // | cycle_delay_const_range_expression
  // cycle_delay_const_range_expression ::=
  // constant_expression : constant_expression
  // | constant_expression : $

  expression_or_dist: $ => seq(
    $.expression,
    optional(seq(
      'dist',
      '{', $.dist_list, '}'
    ))
  ),

  assertion_variable_declaration: $ => seq(
    $._var_data_type,
    $.list_of_variable_decl_assignments,
    ';'
  ),

  // A.2.11 Covergroup declarations

  // A.3 Primitive instances

  // A.3.1 Primitive instantiation and instances

  // A.3.2 Primitive strengths

  // pulldown_strength ::=
  // ( strength0 , strength1 )
  // | ( strength1 , strength0 )
  // | ( strength0 )
  // pullup_strength ::=
  // ( strength0 , strength1 )
  // | ( strength1 , strength0 )
  // | ( strength1 )

  // A.3.3 Primitive terminals

  // enable_terminal ::= expression
  // inout_terminal ::= net_lvalue
  // input_terminal ::= expression
  // ncontrol_terminal ::= expression
  // output_terminal ::= net_lvalue
  // pcontrol_terminal ::= expression

  // A.3.4 Primitive gate and switch types

  // cmos_switchtype ::= cmos | rcmos
  // enable_gatetype ::= bufif0 | bufif1 | notif0 | notif1
  // mos_switchtype ::= nmos | pmos | rnmos | rpmos
  // n_input_gatetype ::= and | nand | or | nor | xor | xnor
  // n_output_gatetype ::= buf | not
  // pass_en_switchtype ::= tranif0 | tranif1 | rtranif1 | rtranif0
  // pass_switchtype ::= tran | rtran

  // A.4 Instantiations

  // A.4.1 Instantiation

  // A.4.1.1 Module instantiation

  module_instantiation: $ => seq(
    $.module_identifier,
    optional($.parameter_value_assignment),
    sep1(',', $.hierarchical_instance),
    ';'
  ),

  parameter_value_assignment: $ => seq(
    '#', '(', optional($.list_of_parameter_assignments), ')'
  ),

  list_of_parameter_assignments: $ => choice(
    sep1(',', $.ordered_parameter_assignment),
    sep1(',', $.named_parameter_assignment)
  ),

  ordered_parameter_assignment: $ => alias($.param_expression, $._ordered_parameter_assignment),

  named_parameter_assignment: $ => seq(
    '.', $.parameter_identifier, '(', optional($.param_expression), ')'
  ),

  hierarchical_instance: $ => seq(
    $.name_of_instance, '(', optional($.list_of_port_connections), ')'
  ),

  name_of_instance: $ => seq(
    $.instance_identifier, repeat($.unpacked_dimension)
  ),

  // Reordered

  list_of_port_connections: $ => choice(
    sep1(',', $.named_port_connection),
    sep1(',', $.ordered_port_connection)
  ),

  ordered_port_connection: $ => seq(
    repeat($.attribute_instance),
    $.expression
  ),

  // from spec:
  // named_port_connection ::=
  //   { attribute_instance } . port_identifier [ ( [ expression ] ) ]
  // | { attribute_instance } .*

  named_port_connection: $ => seq(
    repeat($.attribute_instance),
    choice(
      seq('.', $.port_identifier, optional(seq(
        '(', optional($.expression), ')'
      ))),
      '.*'
    )
  ),

  /* A.4.1.2 Interface instantiation */

  interface_instantiation: $ => seq(
    $.interface_identifier,
    optional($.parameter_value_assignment),
    sep1(',', $.hierarchical_instance),
  ),

  /* A.4.1.3 Program instantiation */

  program_instantiation: $ => seq(
    $.program_identifier,
    optional($.parameter_value_assignment),
    sep1(',', $.hierarchical_instance)
  ),

  /* A.4.1.4 Checker instantiation */

  checker_instantiation: $ => seq(
    $.ps_checker_identifier,
    $.name_of_instance,
    '(',
    // optional($.list_of_checker_port_connections),
    choice(
      sep1(',', optional(seq(
        repeat($.attribute_instance),
        optional($.property_actual_arg)
      ))),
      // sep1(',', $.named_checker_port_connection)
      sep1(',', choice(
        seq(
          repeat($.attribute_instance), '.', $.formal_port_identifier,
          optional(seq('(', optional($.property_actual_arg), ')'))
        ),
        seq(
          repeat($.attribute_instance), '.*'
        )
      ))
    ),
    ')',
    ';'
  ),

  // list_of_checker_port_connections1: $ => choice(
  //   sep1(',', optional($.ordered_checker_port_connection1)),
  //   sep1(',', $.named_checker_port_connection)
  // ),

  // ordered_checker_port_connection: $ => seq(
  //   repeat($.attribute_instance),
  //   optional($.property_actual_arg)
  // ),

  // named_checker_port_connection: $ => choice(
  //   seq(
  //     repeat($.attribute_instance), '.', $.formal_port_identifier,
  //     optional(seq('(', optional($.property_actual_arg), ')'))
  //   ),
  //   seq(
  //     repeat($.attribute_instance, '.*')
  //   )
  // ),

  /* A.4.2 Generated instantiation */

  generate_region: $ => seq(
    'generate', repeat($.generate_item), 'endgenerate'
  ),

  loop_generate_construct: $ => seq(
    'for', '(',
      $.genvar_initialization, ';', $.genvar_expression, ';', $.genvar_iteration,
    ')',
    $.generate_block
  ),

  genvar_initialization: $ => seq(
    optional('genvar'),
    $.genvar_identifier,
    '=',
    $.constant_expression
  ),

  genvar_iteration: $ => choice(
    seq($.genvar_identifier, $.assignment_operator, $.genvar_expression),
    seq($.inc_or_dec_operator, $.genvar_identifier),
    seq($.genvar_identifier, $.inc_or_dec_operator)
  ),

  conditional_generate_construct: $ => choice(
    $.if_generate_construct,
    $.case_generate_construct
  ),

  if_generate_construct: $ => prec.left(seq(
    'if', '(', $.constant_expression, ')', $.generate_block,
    optional(seq(
      'else', $.generate_block
    )),
  )),

  case_generate_construct: $ => seq(
    'case', '(', $.constant_expression, ')', $.case_generate_item,
    repeat($.case_generate_item),
    'endcase'
  ),

  case_generate_item: $ => choice(
    seq(sep1(',', $.constant_expression), ':', $.generate_block),
    seq('default', optional(':'), $.generate_block)
  ),

  generate_block: $ => choice(
    $.generate_item,
    seq(
      optional(seq($.generate_block_identifier, ':')),
      'begin',
      optional(seq(':', $.generate_block_identifier)),
      repeat($.generate_item),
      'end',
      optional(seq(':', $.generate_block_identifier)),
    )
  ),

  generate_item: $ => choice(
    $.module_or_generate_item,
    $.interface_or_generate_item,
    $.checker_or_generate_item
  ),

  /* 5. Lexical conventions */

  // SourceCharacter = .

  /*Letter
    = Lu
    / Ll
    / Lt
    / Lm
    / Lo
    / Nl*/

  /*Digit
    = Nd*/

  /* Annex B */

  ReservedWord: $ => choice(
    $.Keyword,
    $.SystemKeyword,
    // $.NullLiteral,
    // $.BooleanLiteral
  ),

  Keyword: $ => choice(
    'always',
    'and',
    'assert',
    'assign',
    'automatic',
    'begin',
    'bit',
    'break',
    'buf',
    'bufif0',
    'bufif1',
    'byte',
    'case',
    'casex',
    'casez',
    'chandle',
    'clocking',
    'const',
    'const-in-lex',
    'cmos',
    'context',
    'continue',
    'cover',
    'default',
    'defparam',
    'disable',
    'do',
    'edge',
    'else',
    'end',
    'endcase',
    'endclocking',
    'endfunction',
    'endgenerate',
    'endmodule',
    'endpackage',
    'endprimitive',
    'endprogram',
    'endproperty',
    'endspecify',
    'endtable',
    'endtask',
    'enum',
    'export',
    'final',
    'for',
    'forever',
    'function',
    'generate',
    'genvar',
    'global-then-clocking',
    'global-in-lex',
    'if',
    'iff',
    'import',
    'initial',
    'inout',
    'input',
    'int',
    'integer',
    'localparam',
    'logic',
    'longint',
    'module',
    'nand',
    'negedge',
    'nmos',
    'nor',
    'not',
    'notif0',
    'notif1',
    'or',
    'output',
    'package',
    'parameter',
    'pmos',
    'posedge',
    'primitive',
    'priority',
    'program',
    'property',
    'pulldown',
    'pullup',
    'pure',
    'rcmos',
    'real',
    'realtime',
    'reg',
    'repeat',
    'return',
    'rnmos',
    'rpmos',
    'rtran',
    'rtranif0',
    'rtranif1',
    'scalared',
    'shortint',
    'signed',
    'specify',
    'specparam',
    'static',
    'string',
    'supply0',
    'supply1',
    'table',
    'task',
    'time',
    'timeprecision',
    'timeunit',
    'tran',
    'tranif0',
    'tranif1',
    'tri',
    'tri0',
    'tri1',
    'true',
    'typedef',
    'unique',
    'unique0',
    'unsigned',
    'var',
    'vectored',
    'void',
    'while',
    'wire',
    'wreal',
    'xnor',
    'xor'
  ),

  SystemKeyword: $ => choice(
    '$bits',
    '$bitstoreal',
    '$c',
    '$ceil',
    '$clog2',
    '$countones',
    '$display',
    '$error',
    '$exp',
    '$fatal',
    '$fclose',
    '$fdisplay',
    '$feof',
    '$fflush',
    '$fgetc',
    '$fgets',
    '$finish',
    '$floor',
    '$fopen',
    '$fscanf',
    '$fwrite',
    '$info',
    '$isunknown',
    '$itor',
    '$ln',
    '$log10',
    '$onehot',
    '$onehot0',
    '$pow',
    '$random',
    '$readmemb',
    '$readmemh',
    '$realtime',
    '$realtobits',
    '$rtoi',
    '$sformat',
    '$signed',
    '$sqrt',
    '$sscanf',
    '$stime',
    '$stop',
    '$swrite',
    '$system',
    '$test$plusargs',
    '$time',
    '$unit',
    '$unsigned',
    '$value$plusargs',
    '$warning',
    '$write'
  ),

  /* 5.5 Operators */

  /* 5.6 Identifiers, keywords, and system names */

  /* 5.6.1 Escaped identifiers */

  /* 5.6.2 Keywords

  Keywords are predefined nonescaped identifiers that are used to define the
  language constructs. A SystemVerilog keyword preceded by an escape character is
  not interpreted as a keyword. All keywords are defined in lowercase only. Annex
  B gives a list of all defined keywords. Subclause 22.14 discusses compatibility
  of reserved keywords with previous versions of IEEE Std 1364 and IEEE Std 1800.
  */


  /* 5.6.3 System tasks and system functions

  The dollar sign ($) introduces a language construct that enables development of
  user-defined system tasks and system functions. System constructs are not design
  semantics, but refer to simulator functionality. A name following the $ is
  interpreted as a system task or a system function.
  */

  /* 5.6.4 Compiler directives

  The ` character (the ASCII value 0x60, called grave accent) introduces a
  language construct used to implement compiler directives. The compiler behavior
  dictated by a compiler directive shall take effect as soon as the compiler reads
  the directive. The directive shall remain in effect for the rest of the
  compilation unless a different compiler directive specifies otherwise. A
  compiler directive in one description file can, therefore, control compilation
  behavior in multiple description files. The effects of a compiler directive are
  limited to a compilation unit (see 3.12.1) and shall not affect other
  compilation units.
  */

  /* 5.7 Numbers

  Constant numbers can be specified as integer constants (see 5.7.1) or real
  constants (see 5.7.2). The formal syntax for numbers is listed in Syntax 5-2.
  */







  // A.6 Behavioral statements

  // A.6.1 Continuous assignment and net alias statements

  continuous_assign: $ => seq(
    'assign', choice(
      seq(
        optional($.drive_strength),
        optional($.delay3),
        $.list_of_net_assignments
      ),
      // seq(optional($.delay_control), $.list_of_variable_assignments)
    ), ';'
  ),

  list_of_net_assignments: $ => sep1(',', $.net_assignment),

  // list_of_variable_assignments = variable_assignment { , variable_assignment }
  // net_alias = alias net_lvalue = net_lvalue { = net_lvalue } ;

  net_assignment: $ => seq($.net_lvalue, '=', $.expression),

  // A.6.2 Procedural blocks and assignments

  initial_construct: $ => seq('initial', $.statement_or_null),

  always_construct: $ => seq($.always_keyword, $.statement),

  always_keyword: $ => choice(
    'always',
    'always_comb',
    'always_latch',
    'always_ff'
  ),

  final_construct: $ => seq('final', $.function_statement),

  blocking_assignment: $ => choice(
    seq(
      $.variable_lvalue,
      '=', // !=,
      $.delay_or_event_control,
      $.expression
    ),
    // seq(
    //   $.nonrange_variable_lvalue, '=', $.dynamic_array_new
    // ),
    // seq(
    //   optional(choice(
    //     seq($.implicit_class_handle, '.'),
    //     $.class_scope,
    //     $.package_scope
    //   )),
    //   $.hierarchical_variable_identifier
    //   $.select,
    //   '=',
    //   $.class_new
    // ),
    $.operator_assignment
  ),

  operator_assignment: $ => seq(
    $.variable_lvalue,
    $.assignment_operator,
    $.expression
  ),

  // reordered
  assignment_operator: $ => choice(
    '<<<=',
    '>>>=',
    '<<=',
    '>>=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&=',
    '|=',
    '^=',
    '=' // !=
  ),

  nonblocking_assignment: $ => seq(
    $.variable_lvalue, '<=', optional($.delay_or_event_control), $.expression
  ),

  procedural_continuous_assignment: $ => choice(
    seq('assign', $.variable_assignment),
    seq('deassign', $.variable_lvalue),
    seq('force', $.variable_assignment),
    seq('force', $.net_assignment),
    seq('release', $.variable_lvalue),
    seq('release', $.net_lvalue)
  ),

  variable_assignment: $ => seq($.variable_lvalue, '=', $.expression),

  // A.6.3 Parallel and sequential blocks

  action_block: $ => choice(
    $.statement_or_null,
    seq(optional($.statement), 'else', $.statement_or_null)
  ),

  seq_block: $ => seq(
    'begin', optional(':', $.block_identifier),
    repeat($.block_item_declaration),
    repeat($.statement_or_null),
    'end', optional(':', $.block_identifier)
  ),

  par_block: $ => seq(
    'fork', optional(seq(':', $.block_identifier)),
    repeat($.block_item_declaration),
    repeat($.statement_or_null),
    $.join_keyword, optional(seq(':', $.block_identifier))
  ),

  join_keyword: $ => choice('join', 'join_any', 'join_none'),

  // A.6.4 Statements

  statement_or_null: $ => choice(
    $.statement,
    seq(optional($.attribute_instance), ';')
  ),

  statement: $ => seq(
    optional($.block_identifier, ':'),
    repeat($.attribute_instance),
    $.statement_item
  ),

  statement_item: $ => choice(
    // seq($.blocking_assignment, ';'),
    // seq($.nonblocking_assignment, ';'),
    // seq($.procedural_continuous_assignment, ';'),
    $.case_statement,
    $.conditional_statement,
    // seq($.inc_or_dec_expression, ';'),
    // $.subroutine_call_statement,
    // $.disable_statement,
    // $.event_trigger,
    // $.loop_statement,
    // $.jump_statement,
    // $.par_block,
    $.seq_block,
    $.procedural_timing_control_statement,
    // $.wait_statement,
    // $.procedural_assertion_statement,
    // $.clocking_drive ';',
    // $.randsequence_statement,
    // $.randcase_statement,
    // $.expect_property_statement,
  ),

  function_statement: $ => $.statement,

  function_statement_or_null: $ => choice(
    $.function_statement,
    seq(repeat($.attribute_instance), ';')
  ),

  variable_identifier_list: $ => sep1(',', $.variable_identifier),


  // A.6.5 Timing control statements

  procedural_timing_control_statement: $ => seq(
    $._procedural_timing_control, $.statement_or_null // statement_or_null1
  ),

  delay_or_event_control: $ => choice(
    $.delay_control,
    $.event_control,
    seq('repeat', '(', $.expression, ')', $.event_control)
  ),

  delay_control: $ => seq('#', choice(
    $.delay_value,
    seq('(', $.mintypmax_expression, ')')
  )),

  event_control: $ => choice(
    // seq('@', $.hierarchical_event_identifier),
    seq('@', '(', $.event_expression, ')'),
    '@*',
    seq('@', '(*)'),
    // seq('@', $.ps_or_hierarchical_sequence_identifier)
  ),

  event_expression: $ => choice( // reordered : brake recursion
    prec.left(seq($.event_expression, 'or', $.event_expression)),
    prec.left(seq($.event_expression, ',', $.event_expression)),
    seq($.edge_identifier, $.expression), // reordered : help parser
    // seq(
    //   optional($.edge_identifier),
    //   $.expression,
    //   optional(seq('iff', $.expression))
    // ),
    // seq(
    //   $.sequence_instance,
    //   optional(seq('iff', $.expression))
    // ),
    // seq('(', $.event_expression, ')')
  ),

  // event_expression_2: $ => choice( // reordered : help parser
  //   seq($.edge_identifier, $.expression), // reordered : help parser
  //   seq(
  //     optional($.edge_identifier),
  //     $.expression,
  //     optional(seq('iff', $.expression))
  //   ),
  //   // seq(
  //   //   $.sequence_instance,
  //   //   optional(seq('iff', $.expression))
  //   // ),
  //   seq('(', $.event_expression, ')')
  // ),

  _procedural_timing_control: $ => choice(
    $.delay_control,
    $.event_control,
    $.cycle_delay
  ),

  // jump_statement =
  // return [ expression ] ;
  // | break ;
  // | continue ;
  // wait_statement =
  // wait ( expression ) statement_or_null
  // | wait fork ;
  // | wait_order ( hierarchical_identifier { , hierarchical_identifier } )
  //    action_block
  // event_trigger =
  // -> hierarchical_event_identifier ;
  // |->> [ delay_or_event_control ] hierarchical_event_identifier ;
  // disable_statement =
  // disable hierarchical_task_identifier ;
  // | disable hierarchical_block_identifier ;
  // | disable fork ;
  //
  //
  //
  //
  //

  // A.6.6 Conditional statements

  conditional_statement: $ => prec.left(seq(
    optional($.unique_priority),
    'if', '(', $.cond_predicate, ')', $.statement_or_null,
    // repeat(seq('else', 'if', '(', $.cond_predicate, ')', $.statement_or_null)),
    optional(seq('else', $.statement_or_null))
  )),

  unique_priority: $ => choice('unique', 'unique0', 'priority'),

  cond_predicate: $ =>
    $.expression_or_cond_pattern,
    // sep1('&&&', $.expression_or_cond_pattern),

  expression_or_cond_pattern: $ => choice(
    $.expression,
    $.cond_pattern
  ),

  cond_pattern: $ => seq($.expression, 'matches', $.pattern),

  // A.6.7 Case statements

  case_statement: $ => seq(
    optional($.unique_priority),
    choice(
      seq($.case_keyword, '(', $.case_expression, ')', repeat1($.case_item), 'endcase'),
      // seq($.case_keyword, '(', $.case_expression, ')', 'matches', repeat1($.case_pattern_item), 'endcase'),
      // seq('case', '(', $.case_expression, ')', 'inside', repeat1($.case_inside_item), 'endcase')
    )
  ),

  case_keyword: $ => choice('case', 'casez', 'casex'),

  case_expression: $ => $.expression,

  case_item: $ => choice(
    seq(sep1(',', $.case_item_expression), ':', $.statement_or_null),
    seq('default', optional(':'), $.statement_or_null)
  ),

  // case_pattern_item =
  // pattern [ &&& expression ] : statement_or_null
  // | default [ : ] statement_or_null
  // case_inside_item =
  // open_range_list : statement_or_null
  // | default [ : ] statement_or_null

  case_item_expression: $ => $.expression,

  randcase_statement: $ => seq(
    'randcase',
    $.randcase_item,
    repeat($.randcase_item),
    'endcase'
  ),

  randcase_item: $ => seq($.expression, ':', $.statement_or_null),

  open_range_list: $ => sep1(',', $.open_value_range),

  open_value_range: $ => $.value_range,

  // A.6.7.1 Patterns

  pattern: $ => choice(
    seq('.', $.variable_identifier),
    '.*',
    $.constant_expression,
    seq('tagged', $.member_identifier, optional($.pattern)),
    seq('\'{', sep1(',', $.pattern), '}'),
    seq('\'{', sep1(',', seq($.member_identifier, ':', $.pattern)), '}')
  ),

  assignment_pattern: $ => seq(
    '\'{',
    choice(
      sep1(',', $.expression),
      sep1(',', seq($.structure_pattern_key, ':', $.expression)),
      sep1(',', seq($.array_pattern_key, ':', $.expression)),
      seq($.constant_expression, '{', sep1(',', $.expression), '}')
    ),
    '}'
  ),

  structure_pattern_key: $ => choice(
    $.member_identifier,
    $.assignment_pattern_key
  ),

  array_pattern_key: $ => choice(
    $.constant_expression,
    $.assignment_pattern_key
  ),

  assignment_pattern_key: $ => choice(
    $.simple_type,
    'default'
  ),

  assignment_pattern_expression: $ => seq(
    optional($.assignment_pattern_expression_type), $.assignment_pattern
  ),

  assignment_pattern_expression_type: $ => choice(
    $.ps_type_identifier,
    $.ps_parameter_identifier,
    $.integer_atom_type,
    $.type_reference,
  ),

  constant_assignment_pattern_expression: $ => $.assignment_pattern_expression,

  assignment_pattern_net_lvalue: $ => seq(
    '\'{', sep1(',', $.net_lvalue), '}'
  ),

  assignment_pattern_variable_lvalue: $ => seq(
    '\'{', sep1(',', $.variable_lvalue), '}'
  ),

  // A.6.8 Looping statements

  // loop_statement =
  // forever statement_or_null
  // | repeat ( expression ) statement_or_null
  // | while ( expression ) statement_or_null
  // | for ( [ for_initialization ] ; [ expression ] ; [ for_step ] )
  // statement_or_null
  // | do statement_or_null while ( expression ) ;
  // | foreach ( ps_or_hierarchical_array_identifier [ loop_variables ] )
  //    statement
  // for_initialization =
  // list_of_variable_assignments
  // | for_variable_declaration { , for_variable_declaration }
  // for_variable_declaration =
  // [ var ] data_type variable_identifier = expression
  //   { , variable_identifier = expression }14
  // for_step = for_step_assignment { , for_step_assignment }
  // for_step_assignment =
  // operator_assignment
  // | inc_or_dec_expression
  // | function_subroutine_call

  loop_variables1: $ => sep1(',', $.index_variable_identifier),

  // A.6.9 Subroutine call statements

  // subroutine_call_statement =
  // subroutine_call ;
  // | void ' ( function_subroutine_call ) ;

  // A.6.9 Subroutine call statements

  // A.6.10 Assertion statements

  // assertion_item =
  // concurrent_assertion_item
  // | deferred_immediate_assertion_item
  // deferred_immediate_assertion_item
  //  = [ block_identifier : ] deferred_immediate_assertion_statement
  // procedural_assertion_statement =
  // concurrent_assertion_statement
  // | immediate_assertion_statement
  // | checker_instantiation
  // immediate_assertion_statement =
  // simple_immediate_assertion_statement
  // | deferred_immediate_assertion_statement
  // simple_immediate_assertion_statement =
  // simple_immediate_assert_statement
  // | simple_immediate_assume_statement
  // | simple_immediate_cover_statement
  // simple_immediate_assert_statement =
  // assert ( expression ) action_block
  // simple_immediate_assume_statement =
  // assume ( expression ) action_block
  // simple_immediate_cover_statement =
  // cover ( expression ) statement_or_null
  // deferred_immediate_assertion_statement =
  // deferred_immediate_assert_statement
  // | deferred_immediate_assume_statement
  // | deferred_immediate_cover_statement
  // deferred_immediate_assert_statement =
  // assert #0 ( expression ) action_block
  // | assert final ( expression ) action_block
  // deferred_immediate_assume_statement =
  // assume #0 ( expression ) action_block
  // | assume final ( expression ) action_block
  // deferred_immediate_cover_statement =
  // cover #0 ( expression ) statement_or_null
  // | cover final ( expression ) statement_or_null

  // A.6.11 Clocking block

  // clocking_declaration
  // = [ default ] clocking [ clocking_identifier ] clocking_event ;
  // { clocking_item }
  // endclocking [ : clocking_identifier ]
  // | global clocking [ clocking_identifier ] clocking_event ;
  //   endclocking [ : clocking_identifier ]

  clocking_event: $ => seq('@', choice(
    $.identifier,
    seq('@', '(', $.event_expression, ')')
  )),

  // clocking_item =
  // default default_skew ;
  // | clocking_direction list_of_clocking_decl_assign ;
  // | ( attribute_instance __ )* assertion_item_declaration
  // default_skew =
  // input clocking_skew
  // | output clocking_skew
  // | input clocking_skew output clocking_skew
  // clocking_direction =
  // input [ clocking_skew ]
  // | output [ clocking_skew ]
  // | input [ clocking_skew ] output [ clocking_skew ]
  // | inout
  // list_of_clocking_decl_assign
  //   = clocking_decl_assign { , clocking_decl_assign }
  // clocking_decl_assign = signal_identifier [ = expression ]
  // clocking_skew =
  // edge_identifier [ delay_control ]
  // | delay_control
  // clocking_drive =
  // clockvar_expression <= [ cycle_delay ] expression

  cycle_delay: $ => seq('##', choice(
    $.integral_number,
    $.identifier,
    seq('(', $.expression, ')')
  )),

  clockvar: $ => $.hierarchical_identifier,

  clockvar_expression: $ => seq(
    $.clockvar,
    optional($.select1)
  ),

  // A.6.12 Randsequence

  // randsequence_statement = randsequence ( [ production_identifier ] )
  // production { production }
  // endsequence
  // production
  //   = [ data_type_or_void ] production_identifier
  //  [ ( tf_port_list ) ] : rs_rule { | rs_rule } ;
  // rs_rule = rs_production_list [ := weight_specification [ rs_code_block ] ]
  // rs_production_list =
  // rs_prod { rs_prod }
  // | rand join [ ( expression ) ] production_item
  //   production_item { production_item }
  // weight_specification =
  // integral_number
  // | ps_identifier
  // | ( expression )
  // rs_code_block = { { data_declaration } { statement_or_null } }
  // rs_prod =
  // production_item
  // | rs_code_block
  // | rs_if_else
  // | rs_repeat
  // | rs_case
  // production_item = production_identifier [ ( list_of_arguments ) ]
  // rs_if_else = if ( expression ) production_item [ else production_item ]
  // rs_repeat = repeat ( expression ) production_item
  // rs_case = case ( case_expression ) rs_case_item { rs_case_item } endcase
  // rs_case_item =
  // case_item_expression { , case_item_expression } : production_item ;
  // | default [ : ] production_item ;
  // A.7 Specify section
  // A.7.1 Specify block declaration
  // specify_block = specify { specify_item } endspecify
  // specify_item =
  // specparam_declaration
  // | pulsestyle_declaration
  // | showcancelled_declaration
  // | path_declaration
  // | system_timing_check
  // pulsestyle_declaration =
  // pulsestyle_onevent list_of_path_outputs ;
  // | pulsestyle_ondetect list_of_path_outputs ;
  // showcancelled_declaration =
  // showcancelled list_of_path_outputs ;
  // | noshowcancelled list_of_path_outputs ;

  // A.7 Specify section

  // A.7.1 Specify block declaration

  // A.7.2 Specify path declarations

  // path_declaration =
  // simple_path_declaration ;
  // | edge_sensitive_path_declaration ;
  // | state_dependent_path_declaration ;
  // simple_path_declaration =
  // parallel_path_description = path_delay_value
  // | full_path_description = path_delay_value
  // parallel_path_description =
  // ( specify_input_terminal_descriptor [ polarity_operator ]
  //    => specify_output_terminal_descriptor )
  // full_path_description =
  // ( list_of_path_inputs [ polarity_operator ] *> list_of_path_outputs )
  // list_of_path_inputs =
  // specify_input_terminal_descriptor { , specify_input_terminal_descriptor }
  // list_of_path_outputs =
  // specify_output_terminal_descriptor { , specify_output_terminal_descriptor }
  // A.7.3 Specify block terminals
  // specify_input_terminal_descriptor =
  // input_identifier [ [ constant_range_expression ] ]
  // specify_output_terminal_descriptor =
  // output_identifier [ [ constant_range_expression ] ]
  // input_identifier
  //   = input_port_identifier | inout_port_identifier
  //  | interface_identifier.port_identifier
  // output_identifier = output_port_identifier | inout_port_identifier | interface_identifier.port_identifier

  // A.7.3 Specify block terminals

  // A.7.4 Specify path delays

  // path_delay_value =
  // list_of_path_delay_expressions
  // | ( list_of_path_delay_expressions )
  // list_of_path_delay_expressions =
  // t_path_delay_expression
  // | trise_path_delay_expression , tfall_path_delay_expression
  // | trise_path_delay_expression , tfall_path_delay_expression
  //   , tz_path_delay_expression
  // | t01_path_delay_expression , t10_path_delay_expression
  //   , t0z_path_delay_expression ,
  // tz1_path_delay_expression , t1z_path_delay_expression
  //   , tz0_path_delay_expression
  // | t01_path_delay_expression , t10_path_delay_expression
  //   , t0z_path_delay_expression ,
  // tz1_path_delay_expression , t1z_path_delay_expression
  //   , tz0_path_delay_expression ,
  // t0x_path_delay_expression , tx1_path_delay_expression
  //   , t1x_path_delay_expression ,
  // tx0_path_delay_expression , txz_path_delay_expression
  //   , tzx_path_delay_expression
  // t_path_delay_expression = path_delay_expression
  // trise_path_delay_expression = path_delay_expression
  // tfall_path_delay_expression = path_delay_expression
  // tz_path_delay_expression = path_delay_expression
  // t01_path_delay_expression = path_delay_expression
  // t10_path_delay_expression = path_delay_expression
  // t0z_path_delay_expression = path_delay_expression
  // tz1_path_delay_expression = path_delay_expression
  // t1z_path_delay_expression = path_delay_expression
  // tz0_path_delay_expression = path_delay_expression
  // t0x_path_delay_expression = path_delay_expression
  // tx1_path_delay_expression = path_delay_expression
  // t1x_path_delay_expression = path_delay_expression
  // tx0_path_delay_expression = path_delay_expression
  // txz_path_delay_expression = path_delay_expression
  // tzx_path_delay_expression = path_delay_expression
  // path_delay_expression = constant_mintypmax_expression
  // edge_sensitive_path_declaration =
  // parallel_edge_sensitive_path_description = path_delay_value
  // | full_edge_sensitive_path_description = path_delay_value
  // parallel_edge_sensitive_path_description =
  // ( [ edge_identifier ] specify_input_terminal_descriptor
  //  [ polarity_operator ] =>
  // ( specify_output_terminal_descriptor [ polarity_operator ]
  //   : data_source_expression ) )
  // full_edge_sensitive_path_description =
  // ( [ edge_identifier ] list_of_path_inputs [ polarity_operator ] *>
  // ( list_of_path_outputs [ polarity_operator ] : data_source_expression ) )
  // data_source_expression = expression

  edge_identifier: $ => choice('posedge', 'negedge', 'edge'),

  // state_dependent_path_declaration =
  // if ( module_path_expression ) simple_path_declaration
  // | if ( module_path_expression ) edge_sensitive_path_declaration
  // | ifnone simple_path_declaration
  // polarity_operator = + | -

  // A.7.5 System timing checks

  // A.7.5.1 System timing check commands

  // system_timing_check|||||||||||=
  // $setup_timing_check
  // $hold_timing_check
  // $setuphold_timing_check
  // $recovery_timing_check
  // $removal_timing_check
  // $recrem_timing_check
  // $skew_timing_check
  // $timeskew_timing_check
  // $fullskew_timing_check
  // $period_timing_check
  // $width_timing_check
  // $nochange_timing_check
  // $setup_timing_check =
  // $setup ( data_event , reference_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $hold_timing_check =
  // $hold ( reference_event , data_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $setuphold_timing_check =
  // $setuphold ( reference_event , data_event
  //   , timing_check_limit , timing_check_limit
  // [ , [ notifier ] [ , [ timestamp_condition ] [ , [ timecheck_condition ]
  // [ , [ delayed_reference ] [ , [ delayed_data ] ] ] ] ] ] ) ;
  // $recovery_timing_check =
  // $recovery ( reference_event , data_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $removal_timing_check =
  // $removal ( reference_event , data_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $recrem_timing_check =
  // $recrem ( reference_event , data_event ,
  //  timing_check_limit , timing_check_limit
  // [ , [ notifier ] [ , [ timestamp_condition ] [ , [ timecheck_condition ]
  // [ , [ delayed_reference ] [ , [ delayed_data ] ] ] ] ] ] ) ;
  // $skew_timing_check =
  // $skew ( reference_event , data_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $timeskew_timing_check =
  // $timeskew ( reference_event , data_event , timing_check_limit
  // [ , [ notifier ] [ , [ event_based_flag ]
  //  [ , [ remain_active_flag ] ] ] ] ) ;
  // $fullskew_timing_check =
  // $fullskew ( reference_event , data_event
  //  , timing_check_limit , timing_check_limit
  // [ , [ notifier ] [ , [ event_based_flag ]
  //  [ , [ remain_active_flag ] ] ] ] ) ;
  // $period_timing_check =
  // $period ( controlled_reference_event , timing_check_limit
  //  [ , [ notifier ] ] ) ;
  // $width_timing_check =
  // $width ( controlled_reference_event , timing_check_limit
  //  , threshold [ , [ notifier ] ] ) ;
  // $nochange_timing_check =
  // $nochange ( reference_event , data_event
  //  , start_edge_offset , end_edge_offset [ , [ notifier ] ] );

  // A.7.5.2 System timing check command arguments

  // timecheck_condition = mintypmax_expression
  // controlled_reference_event = controlled_timing_check_event
  // data_event = timing_check_event
  // delayed_data =
  // terminal_identifier
  // | terminal_identifier [ constant_mintypmax_expression ]
  // delayed_reference =
  // terminal_identifier
  // | terminal_identifier [ constant_mintypmax_expression ]
  // end_edge_offset = mintypmax_expression
  // event_based_flag = constant_expression
  // notifier = variable_identifier
  // reference_event = timing_check_event
  // remain_active_flag = constant_mintypmax_expression
  // timestamp_condition = mintypmax_expression
  // start_edge_offset = mintypmax_expression
  // threshold = constant_expression
  // timing_check_limit = expression

  // A.7.5.3 System timing check event definitions

  // timing_check_event =
  // [timing_check_event_control] specify_terminal_descriptor
  //    [ &&& timing_check_condition ]
  // controlled_timing_check_event =
  // timing_check_event_control specify_terminal_descriptor
  //  [ &&& timing_check_condition ]
  // timing_check_event_control =
  // posedge
  // | negedge
  // | edge
  // | edge_control_specifier
  // specify_terminal_descriptor =
  // specify_input_terminal_descriptor
  // | specify_output_terminal_descriptor
  // edge_control_specifier = edge [ edge_descriptor { , edge_descriptor } ]
  // edge_descriptor33 = 01 | 10 | z_or_x zero_or_one | zero_or_one z_or_x
  // zero_or_one = 0 | 1
  // z_or_x = x | X | z | Z
  // timing_check_condition =
  // scalar_timing_check_condition
  // | ( scalar_timing_check_condition )
  // scalar_timing_check_condition =
  // expression
  // | ~ expression
  // | expression == scalar_constant
  // | expression === scalar_constant
  // | expression != scalar_constant
  // | expression !== scalar_constant
  // scalar_constant = 1'b0 | 1'b1 | 1'B0 | 1'B1 | 'b0 | 'b1 | 'B0 | 'B1 | 1 | 0
  //
  //
  //
  //
  // A.8 Expressions

  // A.8.1 Concatenations

  concatenation: $ => seq(
    '{', psep1(PREC.CONCAT, ',', $.expression), '}'
  ),

  constant_concatenation: $ => seq(
    '{', psep1(PREC.CONCAT, ',', $.constant_expression), '}'
  ),

  constant_multiple_concatenation: $ => seq(
    '{', $.constant_expression, $.constant_concatenation, '}'
  ),

  module_path_concatenation: $ => seq(
    '{', sep1(',', $.module_path_expression), '}'
  ),

  module_path_multiple_concatenation: $ => seq(
    '{', $.constant_expression, $.module_path_concatenation, '}'
  ),

  multiple_concatenation: $ => seq(
    '{', $.expression, $.concatenation, '}'
  ),

  // streaming_concatenation
  //  = { stream_operator [ slice_size ] stream_concatenation }
  // stream_operator = >> | <<
  // slice_size = simple_type | constant_expression
  // stream_concatenation = { stream_expression { , stream_expression } }
  // stream_expression = expression [ with [ array_range_expression ] ]
  // array_range_expression =
  // expression
  // | expression : expression
  // | expression +: expression
  // | expression -: expression
  empty_unpacked_array_concatenation: $ => seq('{', '}'),

  /* A.8.2 Subroutine calls */

  constant_function_call: $ => $.function_subroutine_call,

  tf_call: $ => seq(
    $.ps_or_hierarchical_tf_identifier,
    repeat($.attribute_instance),
    optional($.list_of_arguments_parent)
  ),

  system_tf_call: $ => seq(
    $.system_tf_identifier,
    choice(
      optional($.list_of_arguments_parent),
      seq(
        '(',
        $.data_type,
        optional(seq(',', $.expression)),
        ')'
      ),
      seq(
        '(',
        $.expression,
        // repeat(seq(',', optional($.expression))),
        optional(seq(',', optional($.clocking_event))),
        ')'
      )
    )
  ),

  subroutine_call: $ => choice(
    $.tf_call,
    $.system_tf_call,
    $.method_call,
    seq(optional(seq('std', '::')), $.randomize_call)
  ),

  function_subroutine_call: $ => $.subroutine_call,

  // list_of_arguments: $ => choice(
  //   seq(
  //     sep1(',', optional($.expression)),
  //     repeat(seq(',', '.', $.identifier, '(', optional($.expression), ')'))
  //   ),
  //   sep1(',', repeat(seq(',', '.', $.identifier, '(', optional($.expression), ')')))
  // ),

  list_of_arguments_parent: $ => seq(
    '(',
    choice(
      seq(
        // sep1(',', optional($.expression)),
        repeat(seq(
          ',', '.', $.identifier, '(', optional($.expression), ')'
        ))
      ),
      sep1(',', repeat(seq(',', '.', $.identifier, '(', optional($.expression), ')')))
    ),
    ')'
  ),

  method_call: $ => seq($.method_call_root, '.', $.method_call_body),

  method_call_body: $ => choice(
    seq(
      $.method_identifier,
      repeat($.attribute_instance),
      optional($.list_of_arguments_parent)
    ),
    $.built_in_method_call
  ),

  built_in_method_call: $ => choice(
    $.array_manipulation_call,
    $.randomize_call
  ),

  array_manipulation_call: $ => seq(
    $.array_method_name,
    repeat($.attribute_instance),
    optional($.list_of_arguments_parent),
    optional(seq(
      'with', '(', $.expression, ')'
    ))
  ),

  randomize_call: $ => seq(
    'randomize',
    repeat($.attribute_instance),
    optional(seq(
      '(',
      optional(choice(
        $.variable_identifier_list,
        'null'
      )),
      ')'
    )),
    optional(seq(
      'with',
      optional(seq(
        '(',
        optional($.identifier_list),
        ')'
      )),
      $.constraint_block
    ))
  ),

  method_call_root: $ => choice($.primary, $.implicit_class_handle),

  array_method_name: $ => choice(
    $.method_identifier, 'unique', 'and', 'or', 'xor'
  ),

  // A.8.3 Expressions

  inc_or_dec_expression: $ => choice(
    seq($.inc_or_dec_operator, repeat($.attribute_instance), $.variable_lvalue),
    seq($.variable_lvalue, repeat($.attribute_instance), $.inc_or_dec_operator)
  ),

  conditional_expression: $ => prec.left(PREC.CONDITIONAL, seq(
    $.cond_predicate,
    '?',
    repeat($.attribute_instance), $.expression,
    ':',
    $.expression
  )),

  constant_expression: $ => choice(
    $.constant_primary,

    prec.left(PREC.UNARY, seq(
      $.unary_operator,
      repeat($.attribute_instance),
      $.constant_primary
    )),

    constExprOp($, PREC.ADD, choice('+', '-')),
    constExprOp($, PREC.MUL, choice('*', '/', '%')),
    constExprOp($, PREC.EQUAL, choice('==','!=', '===', '!==','==?', '!=?')),
    constExprOp($, PREC.LOGICAL_AND, '&&'),
    constExprOp($, PREC.LOGICAL_OR, '||'),
    constExprOp($, PREC.POW, '**'),
    constExprOp($, PREC.RELATIONAL, choice('<', '<=', '>', '>=')),
    constExprOp($, PREC.AND, '&'),
    constExprOp($, PREC.OR, '|'),
    constExprOp($, PREC.XOR, choice('^', '^~', '~^')),
    constExprOp($, PREC.SHIFT, choice('>>', '<<', '>>>', '<<<')),
    constExprOp($, PREC.IMPLICATION, choice('->', '<->')),

    prec.left(PREC.CONDITIONAL, seq(
      $.constant_expression,
      '?',
      repeat($.attribute_instance),
      ':',
      $.constant_expression
    )),
  ),

  constant_mintypmax_expression: $ => seq(
    $.constant_expression,
    optional(seq(':', $.constant_expression, ':', $.constant_expression))
  ),

  constant_param_expression: $ => choice(
    $.constant_mintypmax_expression,
    $.data_type,
    '$'
  ),

  param_expression: $ => choice(
    $.mintypmax_expression,
    $.data_type,
    '$'
  ),

  constant_range_expression: $ => choice(
    $.constant_expression,
    $.constant_part_select_range
  ),

  constant_part_select_range: $ => choice(
    $.constant_range,
    $.constant_indexed_range
  ),

  constant_range: $ => seq(
    $.constant_expression,
    ':',
    $.constant_expression
  ),

  constant_indexed_range: $ => seq(
    $.constant_expression, choice('+:', '-:'), $.constant_expression
  ),

  expression: $ => choice(
    $.primary,

    prec.left(PREC.UNARY, seq(
      $.unary_operator,
      repeat($.attribute_instance),
      $.primary
    )),

    prec.left(PREC.UNARY, $.inc_or_dec_expression),
    // seq('(', $.operator_assignment, ')'),

    exprOp($, PREC.ADD, choice('+', '-')),
    exprOp($, PREC.MUL, choice('*', '/', '%')),
    exprOp($, PREC.EQUAL, choice('==','!=', '===', '!==','==?', '!=?')),
    exprOp($, PREC.LOGICAL_AND, '&&'),
    exprOp($, PREC.LOGICAL_OR, '||'),
    exprOp($, PREC.POW, '**'),
    exprOp($, PREC.RELATIONAL, choice('<', '<=', '>', '>=')),
    exprOp($, PREC.AND, '&'),
    exprOp($, PREC.OR, '|'),
    exprOp($, PREC.XOR, choice('^', '^~', '~^')),
    exprOp($, PREC.SHIFT, choice('>>', '<<', '>>>', '<<<')),
    exprOp($, PREC.IMPLICATION, choice('->', '<->')),

    $.conditional_expression,
    // $.inside_expression,
    // $.tagged_union_expression,
  ),

  tagged_union_expression: $ => seq(
    'tagged',
    $.member_identifier,
    optional($.expression)
  ),

  // inside_expression: $ => seq(
  //   $.expression, 'inside', '{', $.open_range_list, '}'
  // ),

  value_range: $ => choice(
    $.expression,
    seq('[', $.expression, ':', $.expression, ']')
  ),

  mintypmax_expression: $ => seq(
    $.expression,
    optional(seq(':', $.expression, ':', $.expression))
  ),

  module_path_conditional_expression: $ => seq(
    $.module_path_expression,
    '?',
    repeat($.attribute_instance), $.module_path_expression,
    ':',
    $.module_path_expression
  ),

  module_path_expression: $ => choice(
    $.module_path_primary,
    // seq($.unary_module_path_operator, repeat($.attribute_instance), $.module_path_primary),
    // seq(
    //   $.module_path_expression,
    //   $.binary_module_path_operator,
    //   repeat($.attribute_instance),
    //   $.module_path_expression
    // ),
    // $.module_path_conditional_expression
  ),

  module_path_mintypmax_expression: $ => seq(
    $.module_path_expression,
    optional(seq(
      ':', $.module_path_expression,
      ':', $.module_path_expression
    ))
  ),

  part_select_range: $ => choice(
    $.constant_range,
    $.indexed_range
  ),

  indexed_range: $ => seq(
    $.expression, choice('+:', '-:'), $.constant_expression
  ),

  genvar_expression: $ => $.constant_expression,

  /* A.8.4 Primaries */

  constant_primary: $ => choice(
    $.primary_literal,
    seq(
      $.ps_parameter_identifier,
      optional($.constant_select1)
    ),
    seq(
      $.specparam_identifier,
      optional(seq('[', $.constant_range_expression, ']'))
    ),
    $.genvar_identifier,
    seq(
      $.formal_port_identifier,
      optional($.constant_select1)
    ),
    seq(
      optional(choice($.package_scope, $.class_scope)),
      $.enum_identifier
    ),
    seq(
      $.constant_concatenation,
      optional(seq('[', $.constant_range_expression, ']'))
    ),
    seq(
      $.constant_multiple_concatenation,
      optional(seq('[', $.constant_range_expression, ']'))
    ),
    $.constant_function_call,
    // $.constant_let_expression,
    seq('(', $.constant_mintypmax_expression, ')'),
    $.constant_cast,
    // $.constant_assignment_pattern_expression,
    $.type_reference,
    'null'
  ),

  module_path_primary: $ => choice(
    $.number,
    $.identifier,
    $.module_path_concatenation,
    $.module_path_multiple_concatenation,
    $.function_subroutine_call,
    seq('(', $.module_path_mintypmax_expression, ')')
  ),

  primary: $ => choice(
    $.primary_literal,
    seq(
      optional(choice($.class_qualifier, $.package_scope)),
      $.hierarchical_identifier,
      optional($.select1)
    ),
    $.empty_unpacked_array_concatenation,
    seq($.concatenation, optional('[', $.range_expression, ']')),
    seq($.multiple_concatenation, optional('[', $.range_expression, ']')),
    // $.function_subroutine_call,
    // $.let_expression,
    seq('(', $.mintypmax_expression, ')'),
    $.cast,
    $.assignment_pattern_expression,
    // $.streaming_concatenation,
    // $.sequence_method_call,
    'this',
    '$',
    'null'
  ),

  class_qualifier: $ => seq(
    optional(seq('local', '::')),
    choice( // TODO optional?
      seq($.implicit_class_handle, '.'),
      $.class_scope
    )
  ),


  range_expression: $ => choice(
    $.expression,
    $.part_select_range
  ),
  //

  primary_literal: $ => choice(
    $.number,
    $.time_literal,
    // $.unbased_unsized_literal,
    // $.string_literal
  ),


  time_literal: $ => choice(
    seq($.unsigned_number, $.time_unit),
    seq($.fixed_point_number, $.time_unit)
  ),

  time_unit: $ => choice('s', 'ms', 'us', 'ns', 'ps', 'fs'),

  string_literal: $ => token.immediate(prec(1, /[^\\"\n]+/)),

  implicit_class_handle: $ => choice(
    prec.left(seq('this', optional(seq('.', 'super')))),
    'super'
  ),

  // select1: $ => choice( // reordered -> non empty
  //   seq(
  //     repeat(seq('.', $.member_identifier, optional($.bit_select1))),
  //     '.', $.member_identifier,
  //     optional($.bit_select1),
  //     optional(seq('[', $.part_select_range, ']'))
  //   ),
  //   seq(
  //     $.bit_select1,
  //     optional(seq('[', $.part_select_range, ']'))
  //   ),
  //   seq('[', $.part_select_range, ']')
  // ),

  // bit_select1: $ => repeat1(seq( // reordered -> non empty
  //   '[', $.expression, ']')
  // ),

  select1: $ => choice( // reordered -> non empty
    seq(
      '[',
      repeat(seq($.expression, ']', '[')),
      choice(
        $.expression,
        $.part_select_range
      ),
      ']'
    )
  ),

  // nonrange_select1: $ => choice( // reordered -> non empty
  //   seq(
  //     seq(
  //       repeat(seq('.', $.member_identifier, optional($.bit_select1))),
  //       '.', $.member_identifier
  //     ),
  //     optional($.bit_select1)
  //   ),
  //   $.bit_select1
  // ),

  constant_bit_select1: $ => repeat1(seq( // reordered -> non empty
    '[', $.constant_expression, ']')
  ),

  constant_select1: $ => choice( // reordered -> non empty
    seq(
      '[',
      repeat(seq($.constant_expression, ']', '[')),
      choice($.constant_expression, $.constant_part_select_range),
      ']'
    )
  ),

  // constant_select1: $ => choice( // reordered -> non empty
  //   // seq(
  //   //   repeat(seq('.', $.member_identifier, optional($.constant_bit_select1))),
  //   //   '.', $.member_identifier,
  //   //   optional($.constant_bit_select1),
  //   //   optional(seq('[', $.constant_part_select_range, ']'))
  //   // ),
  //   seq(
  //     $.constant_bit_select1,
  //     optional(seq('[', $.constant_part_select_range, ']'))
  //   ),
  //   seq('[', $.constant_part_select_range, ']'),
  // ),

  constant_cast: $ => seq($.casting_type, '\'', '(', $.constant_expression, ')'),

  // constant_let_expression: $ => $.let_expression,

  cast: $ => seq($.casting_type, '\'', '(', $.expression, ')'),

  // A.8.5 Expression left-side values

  net_lvalue: $ => choice(
    seq(
      $.ps_or_hierarchical_net_identifier,
      optional($.constant_select1)
    ),
    seq('{', sep1(',', $.net_lvalue), '}'),
    // seq(optional($.assignment_pattern_expression_type), $.assignment_pattern_net_lvalue)
  ),

  variable_lvalue: $ => choice(
    // ( implicit_class_handle __ '.' / package_scope )? ($.hierarchical_variable_identifier, $.select),
    seq('{', sep1(',', $.variable_lvalue), '}'),
    seq(optional($.assignment_pattern_expression_type), $.assignment_pattern_variable_lvalue),
    // $.streaming_concatenation
  ),

  // nonrange_variable_lvalue
  //   = ( implicit_class_handle __ '.' / package_scope )? __
  //     hierarchical_variable_identifier __ nonrange_select

  // A.8.6 Operators

  unary_operator: $ => choice(
    '~|', // !'=') /
    '~^', // !'=') /
    '~&', // !'=') /
    '^~',
    '+', // ![ += ]) /
    '-', // ![- >= ]) /
    '!', // ![ != ]) /
    '&', // ![ &= ]) /
    '|', // ![ |= ]) /
    '^', // ![ |= ]) /
    '~', // ![ | ^ &= ])
  ),

  inc_or_dec_operator: $ => choice('++', '--'),

  // unary_module_path_operator = '~&' /
  //   '~|' /
  //   '~^' /
  //   '^~' /
  //   $('!'![ != ]) /
  //   $('~'!'=') /
  //   $('&'!'=') /
  //   $('|'!'=') /
  //   $('^'!'=')
  //
  // binary_module_path_operator = $('=='!'=') /
  //   $('!='!'=') /
  //   '&&' /
  //   '||' /
  //   $('&'!'=') /
  //   $('|'!'=') /
  //   $('^'!'=') /
  //   '^~' /
  //   '~^'

  /* A.8.7 Numbers */

  number: $ => choice($.integral_number, $.real_number),

  integral_number: $ => token(/\d+/),

  // integral_number ::=
  // decimal_number
  // | octal_number
  // | binary_number
  // | hex_number

  // decimal_number ::=
  // unsigned_number
  // | [ size ] decimal_base unsigned_number
  // | [ size ] decimal_base x_digit { _ }
  // | [ size ] decimal_base z_digit { _ }
  // binary_number ::= [ size ] binary_base binary_value
  // octal_number ::= [ size ] octal_base octal_value
  // hex_number ::= [ size ] hex_base hex_value
  // sign ::= + | -
  // size ::= non_zero_unsigned_number
  // non_zero_unsigned_number ::= non_zero_decimal_digit { _ | decimal_digit}

  // real_number ::=
  // fixed_point_number
  // | unsigned_number [ . unsigned_number ] exp [ sign ] unsigned_number
  real_number: $ => token(/\d+(\.\d+)?/),

  fixed_point_number: $ => seq($.unsigned_number, '.', $.unsigned_number), // FIXME no space between dot and digits


  // exp ::= e | E

  // unsigned_number ::= decimal_digit { _ | decimal_digit }
  unsigned_number: $ => token(/\d+/),

  // binary_value ::= binary_digit { _ | binary_digit }
  // octal_value ::= octal_digit { _ | octal_digit }
  // hex_value ::= hex_digit { _ | hex_digit }
  // decimal_base ::= '[ s|S]d | '[s|S]D
  // binary_base ::= '[s|S]b | '[s|S]B
  // octal_base ::= '[s|S]o | ' [s|S]O
  // hex_base ::= '[s|S]h | '[s|S]H
  // non_zero_decimal_digit ::= 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  // decimal_digit ::= 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  // binary_digit ::= x_digit | z_digit | 0 | 1
  // octal_digit ::= x_digit | z_digit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  // hex_digit ::= x_digit | z_digit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | a | b | c | d | e | f | A | B | C | D | E | F
  // x_digit ::= x | X
  // z_digit ::= z | Z | ?
  // unbased_unsized_literal ::= '0 | '1 | 'z_or_x

  /* A.9 General */

  /* A.9.1 Attributes */

  attribute_instance: $ => seq('(*', sep1(',', $.attr_spec), '*)'),

  attr_spec: $ => seq($.attr_name, optional('=', $.constant_expression)),

  attr_name: $ => $.identifier,

  /* A.9.2 Comments */

  // comment ::= one_line_comment | block_comment
  // one_line_comment ::= // comment_text \n
  // block_comment ::= /* comment_text */
  // comment_text ::= { Any_ASCII_character }

  // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
  // from: https://github.com/tree-sitter/tree-sitter-c/blob/master/grammar.js
  comment: $ => token(choice(
    seq('//', /.*/),
    seq(
      '/*',
      /[^*]*\*+([^/*][^*]*\*+)*/,
      '/'
    )
  )),

  /* A.9.3 Identifiers */

  block_identifier: $ => alias($.identifier, $._block_identifier),
  array_identifier: $ => alias($.identifier, $._array_identifier),
  bin_identifier: $ => alias($.identifier, $._bin_identifier),
  c_identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
  cell_identifier: $ => alias($.identifier, $._cell_identifier),
  checker_identifier: $ => alias($.identifier, $._checker_identifier),
  class_identifier: $ => alias($.identifier, $._class_identifier),
  // class_variable_identifier = variable_identifier
  clocking_identifier: $ => alias($.identifier, $._clocking_identifier),
  config_identifier: $ => alias($.identifier, $._config_identifier),
  const_identifier: $ => alias($.identifier, $._const_identifier),
  constraint_identifier: $ => alias($.identifier, $._constraint_identifier),
  covergroup_identifier: $ => alias($.identifier, $._covergroup_identifier),
  // covergroup_variable_identifier = variable_identifier
  cover_point_identifier: $ => alias($.identifier, $._cover_point_identifier),
  cross_identifier: $ => alias($.identifier, $._cross_identifier),
  dynamic_array_variable_identifier: $ => alias($.variable_identifier, $._dynamic_array_variable_identifier),
  enum_identifier: $ => alias($.identifier, $._enum_identifier),
  // escaped_identifier
  //  = \ {any_printable_ASCII_character_except_white_space} white_space
  formal_identifier: $ => alias($.identifier, $._formal_identifier),
  formal_port_identifier: $ => alias($.identifier, $._formal_port_identifier),
  function_identifier: $ => alias($.identifier, $._function_identifier),
  generate_block_identifier: $ => alias($.identifier, $._generate_block_identifier),
  genvar_identifier: $ => alias($.identifier, $._genvar_identifier),
  hierarchical_array_identifier: $ => $.hierarchical_identifier,
  hierarchical_block_identifier: $ => $.hierarchical_identifier,
  hierarchical_event_identifier: $ => $.hierarchical_identifier,

  hierarchical_identifier: $ => seq(
    // optional(seq('$root', '.')),
    // repeat1(seq($.identifier, $.constant_bit_select, '.')), // reordered : repeat -> repeat1
    // $.identifier
    $.identifier //, repeat(seq('.', $.identifier))
  ),

  hierarchical_net_identifier: $ => $.hierarchical_identifier,
  hierarchical_parameter_identifier: $ => $.hierarchical_identifier,
  hierarchical_property_identifier: $ => $.hierarchical_identifier,
  hierarchical_sequence_identifier: $ => $.hierarchical_identifier,
  hierarchical_task_identifier: $ => $.hierarchical_identifier,
  hierarchical_tf_identifier: $ => $.hierarchical_identifier,
  hierarchical_variable_identifier: $ => $.hierarchical_identifier,

  identifier: $ => choice(
    $.simple_identifier
    // $.escaped_identifier
  ),

  index_variable_identifier: $ => alias($.identifier, $._index_variable_identifier),
  interface_identifier: $ => alias($.identifier, $._interface_identifier),
  interface_instance_identifier: $ => alias($.identifier, $._interface_instance_identifier),
  inout_port_identifier: $ => alias($.identifier, $._inout_port_identifier),
  input_port_identifier: $ => alias($.identifier, $._input_port_identifier),
  instance_identifier: $ => alias($.identifier, $._instance_identifier),
  library_identifier: $ => alias($.identifier, $._library_identifier),
  member_identifier: $ => alias($.identifier, $._member_identifier),
  method_identifier: $ => alias($.identifier, $._method_identifier),
  modport_identifier: $ => alias($.identifier, $._modport_identifier),
  module_identifier: $ => alias($.identifier, $._module_identifier),
  net_identifier: $ => alias($.identifier, $._net_identifier),
  net_type_identifier: $ => alias($.identifier, $._net_type_identifier),
  output_port_identifier: $ => alias($.identifier, $._output_port_identifier),
  package_identifier: $ => alias($.identifier, $._package_identifier),

  package_scope: $ => choice(
    seq($.package_identifier, '::'),
    seq('$unit', '::')
  ),

  parameter_identifier: $ => token(/[a-zA-Z_]\w*/),

  port_identifier: $ => alias($.identifier, $._port_identifier),
  production_identifier: $ => alias($.identifier, $._production_identifier),
  program_identifier: $ => alias($.identifier, $._program_identifier),
  property_identifier: $ => alias($.identifier, $._property_identifier),

  ps_class_identifier: $ => seq(
    // optional($.package_scope),
    $.class_identifier
  ),

  ps_covergroup_identifier: $ => seq(
    optional($.package_scope),
    $.covergroup_identifier
  ),

  ps_checker_identifier: $ => seq(
    optional($.package_scope),
    $.checker_identifier
  ),

  ps_identifier: $ => seq(
    optional($.package_scope), $.identifier
  ),

  ps_or_hierarchical_array_identifier: $ => seq(
    optional(choice(
      seq($.implicit_class_handle, '.'),
      $.class_scope,
      $.package_scope
    )),
    $.hierarchical_array_identifier
  ),

  ps_or_hierarchical_net_identifier: $ => choice(
    // seq(optional($.package_scope), $.net_identifier),
    $.hierarchical_net_identifier
  ),

  ps_or_hierarchical_property_identifier: $ => choice(
    seq(optional($.package_scope), $.property_identifier),
    $.hierarchical_property_identifier
  ),

  ps_or_hierarchical_sequence_identifier: $ => choice(
    seq(optional($.package_scope), $.sequence_identifier),
    $.hierarchical_sequence_identifier
  ),

  ps_or_hierarchical_tf_identifier: $ => choice(
    seq(optional($.package_scope), $.tf_identifier),
    $.hierarchical_tf_identifier
  ),

  ps_parameter_identifier: $ => choice(
    seq(optional(choice($.package_scope, $.class_scope)), $.parameter_identifier),
    seq(
      repeat(seq(
        $.generate_block_identifier,
        optional(seq('[', $.constant_expression, ']')),
        '.'
      )),
      $.parameter_identifier
    )
  ),

  ps_type_identifier: $ => seq(
    optional(choice(
      seq('local', '::'),
      $.package_scope,
      $.class_scope
    )),
    $.type_identifier
  ),

  sequence_identifier: $ => $.identifier,

  // signal_identifier = identifier

  simple_identifier: $ => /[a-zA-Z_]\w*/,

  specparam_identifier: $ => alias($.identifier, $._specparam_identifier),

  system_tf_identifier: $ => /[a-zA-Z0-9_$]+/,

  task_identifier: $ => alias($.identifier, $._task_identifier),
  tf_identifier: $ => alias($.identifier, $._tf_identifier),
  terminal_identifier: $ => alias($.identifier, $._terminal_identifier),
  topmodule_identifier: $ => alias($.identifier, $._topmodule_identifier),
  type_identifier: $ => alias($.identifier, $._type_identifier),
  udp_identifier: $ => alias($.identifier, $._udp_identifier),
  variable_identifier: $ => alias($.identifier, $._variable_identifier),

  /* A.9.4 White space */

  // white_space ::= space | tab | newline | eof};

};

module.exports = grammar({
  name: 'verilog',
  // word: $ => $.simple_identifier,
  rules: rules,
  extras: $ => [/\s/, $.comment],
  conflicts: $ => [
    [$.primary, $.implicit_class_handle],
    [$.primary, $.constant_primary],
    [$.primary, $.hierarchical_tf_identifier],
    [$.constant_function_call, $.primary],
    [$.primary, $.param_expression],
    [$.hierarchical_identifier, $.formal_port_identifier, $.specparam_identifier],
    [$.hierarchical_identifier, $.enum_identifier, $.tf_identifier],
    [$.hierarchical_identifier, $.enum_identifier, $.formal_port_identifier, $.genvar_identifier, $.specparam_identifier, $.tf_identifier],
    [$.hierarchical_identifier, $.enum_identifier, $.formal_port_identifier, $.genvar_identifier, $.member_identifier, $.specparam_identifier, $.tf_identifier],
    [$.hierarchical_identifier, $.generate_block_identifier],
    [$.hierarchical_identifier, $.generate_block_identifier, $.tf_identifier],
    [$.hierarchical_identifier, $.formal_port_identifier, $.generate_block_identifier, $.specparam_identifier],
    [$.hierarchical_identifier, $.tf_identifier],
    [$.simple_identifier, $.parameter_identifier],
    [$.dpi_function_import_property, $.dpi_task_import_property],
    [$.class_method, $.constraint_prototype_qualifier],
    [$.checker_or_generate_item_declaration, $._package_or_generate_item_declaration],
    [$.module_or_generate_item, $.interface_or_generate_item],
    [$._module_common_item, $.checker_or_generate_item],
    [$.class_method, $.method_qualifier],
    [$.class_identifier, $.package_identifier],
    [$.enum_identifier, $.formal_port_identifier, $.genvar_identifier, $.specparam_identifier],
    [$.formal_port_identifier, $.specparam_identifier],
    [$.formal_port_identifier, $.generate_block_identifier, $.specparam_identifier],
    [$.integral_number, $.unsigned_number],
    [$.enum_identifier, $.tf_identifier],
    [$.method_call_body, $.array_method_name],
    [$.simple_type, $.constant_primary],
    [$.constant_primary, $.class_qualifier, $.ps_parameter_identifier, $.ps_type_identifier],
    [$.method_call_root, $.class_qualifier],
    [$.structure_pattern_key, $.array_pattern_key],
    [$.pattern, $.structure_pattern_key],
    [$.constraint_set, $.empty_unpacked_array_concatenation],
    [$.module_identifier, $.interface_identifier],
    [$.module_identifier, $.interface_identifier, $.program_identifier],
    [$.module_identifier, $.hierarchical_identifier, $.interface_identifier],
    [$.module_identifier, $.interface_identifier, $.program_identifier, $.checker_identifier],
    [$.interface_declaration, $.non_port_interface_item],
    [$.program_declaration, $.non_port_program_item],
    [$.list_of_ports, $.list_of_port_declarations],
    [$.expression_or_dist, $.mintypmax_expression],
    [$.interface_identifier, $.program_identifier],
    [$._module_common_item, $.checker_generate_item]
  ],

});
